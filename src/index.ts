import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import config from '../config.json' with { type: 'json' };
import { GetRun, GetRuns, NewRun, Overview, Webhook } from './routes.js';
import type { Context } from 'hono';
import db from './database.js';
import redis from './redis.js';
import github from './github.js';
import { processWebhook } from './webhook.js';
import { io, setupSocketIO } from './socketio.js';

const authenticate = (c: Context) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    const [prefix, ...rest] = token.split('/');
    const secret = rest.join('/');

    const client = config.clients.find(
      (client) => client.secret === secret && client.prefixes.includes(prefix)
    );
    return {
      client,
      prefix: prefix || client?.prefixes[0] || undefined
    };
  }
  return { client: undefined, prefix: undefined };
};

const app = new OpenAPIHono();

app.use('/*', cors());

app.openapi(NewRun, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const run = c.req.valid('json');
  const currentRun = await db.getCurrentRun(run.user, prefix);
  if (currentRun) {
    return c.json(currentRun, 409);
  }
  const { objectId, runId } = await db.createRun(run, { name: client.name, prefix });
  const response = await github.requestRun(run, objectId, runId);
  return c.json(response, 201);
});

app.openapi(GetRuns, async (c) => {
  const { client, prefix } = authenticate(c);
  if (!client || !prefix) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const query = c.req.valid('query');
  const result = await db.getRuns(query, prefix);
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
  return c.json(result, 200);
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
