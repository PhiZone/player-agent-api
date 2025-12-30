import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import config from '../config.json' with { type: 'json' };
import { CancelRun, GetRun, GetRunProgress, GetRuns, NewRun, Overview, Webhook } from './routes.js';
import type { Context } from 'hono';
import db from './database.js';
import redis from './redis.js';
import github from './github.js';
import { processWebhook } from './webhook.js';
import { io, setupSocketIO } from './socketio.js';
import type { OutputFiles } from './schemas.js';

const authenticate = (c: Context) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    const isPrefixed = token.includes('/');
    const parts = token.split('/');
    const prefix = isPrefixed ? parts.shift() : undefined;
    const secret = isPrefixed ? parts.join('/') : token;

    const client = config.clients.find(
      (client) => client.secret === secret && (!prefix || client.prefixes.includes(prefix))
    );
    return {
      client,
      prefix: prefix || client?.prefixes[0] || undefined
    };
  }
  return { client: undefined, prefix: undefined };
};

const transformFiles = async (files: OutputFiles) => {
  return await Promise.all(
    files.map(async (file) => {
      if (file.url || !file.artifact) return file;
      const { owner, repo, artifactId } = file.artifact;
      const artifactUrl = await github.getArtifactUrl(owner, repo, artifactId);
      return { ...file, url: artifactUrl };
    })
  );
};

const app = new OpenAPIHono();

app.use('/*', cors());

app.openapi(NewRun, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const run = c.req.valid('json');
  
  // Check concurrency limit
  const concurrency = client.concurrency ?? 1;
  const hasLimit = concurrency > 0;
  
  if (hasLimit) {
    // Run both database queries concurrently for better performance
    const [incompleteRunCount, currentRun] = await Promise.all([
      db.countIncompleteRuns(run.user, prefix),
      db.getCurrentRun(run.user, prefix)
    ]);
    
    if (incompleteRunCount >= concurrency) {
      // Concurrency limit reached, return one of the existing runs if available
      if (currentRun) {
        return c.json(currentRun, 409);
      }
      // If no run found, they all just completed (race condition)
      // Allow the new run to be created
    }
    // Note: There is a small race condition window between checking the count
    // and creating the run. Multiple simultaneous requests from the same user
    // could theoretically exceed the limit briefly. This is acceptable for most
    // use cases and would require distributed locking or transactions to fix properly.
  }
  
  const { objectId, runId } = await db.createRun(run, { name: client.name, prefix });
  const { queueSize, queueTime } = await github.requestRun(run, objectId, runId);
  return c.json({ objectId, runId, prefix, queueSize, queueTime }, 201);
});

app.openapi(GetRuns, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const query = c.req.valid('query');
  const result = await db.getRuns(query, prefix);
  result.runs = await Promise.all(
    result.runs.map(async (run) => {
      run.outputFiles = await transformFiles(run.outputFiles);
      return run;
    })
  );
  return c.json(result, 200);
});

app.openapi(GetRun, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const params = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await db.getRun(params.id, query.user, prefix);
  if (!result) {
    return c.json({ error: 'Run not found' }, 404);
  }
  result.outputFiles = await transformFiles(result.outputFiles);
  return c.json(result, 200);
});

app.openapi(GetRunProgress, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const params = c.req.valid('param');
  const query = c.req.valid('query');
  const result = await db.getRun(params.id, query.user, prefix);
  if (!result) {
    return c.json({ error: 'Run not found' }, 404);
  }
  const pattern = `phizone:pa:run:${result._id}:*`;
  const key = (await redis.client.keys(pattern)).at(0);
  if (!key) {
    return c.json(
      {
        status: 'queued',
        progress: 0,
        eta: 0
      },
      200
    );
  }
  const { status, progress, eta } = JSON.parse((await redis.client.get(key)) || '{}');
  return c.json({ status, progress, eta }, 200);
});

app.openapi(CancelRun, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const params = c.req.valid('param');
  const query = c.req.valid('query');
  const run = await db.getRun(params.id, query.user, prefix);
  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }
  const status = await github.cancelRun(run._id);
  if (!status && run.status !== 'in_progress') {
    return c.json({ error: 'Run not initialized' }, 409);
  }
  run.status = 'cancelled';
  run.dateCompleted = new Date();
  await db.updateRun(run);
  return c.newResponse(null, 202);
});

app.openapi(Webhook, async (c) => {
  const params = c.req.valid('param');
  const body = c.req.valid('json');
  try {
    await processWebhook(params, body);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ error: 'Webhook processing failed' }, 400);
  }
  return c.newResponse(null, 204);
});

app.doc('/openapi', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'PhiZone Player Agent API'
  }
});

app.get('/swagger', swaggerUI({ title: 'PhiZone Player Agent API', url: '/openapi' }));

app.openapi(Overview, async (c) => {
  const runCount = await db.countRuns();
  const userCount = await db.countUsers();
  return c.json({ runCount, userCount }, 200);
});

const server = serve(
  {
    fetch: app.fetch,
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}.`);
  }
);

setupSocketIO(server);

let shutdownInitiated = false;
process.on('SIGINT', async () => {
  if (shutdownInitiated) {
    console.log('\nForce exiting...');
    process.exit(1);
  }
  shutdownInitiated = true;
  console.log('\nGracefully shutting down...');
  io.disconnectSockets(true);
  redis.disconnect();
  await db.disconnect();
  server.close();
  console.log('Process exited.');
  process.exit(0);
});
