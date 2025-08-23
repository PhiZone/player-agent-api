import db from './database.js';
import github from './github.js';
import { redis } from './redis.js';
import type { Webhook } from './schemas.js';
import unzipper from 'unzipper';
import { io } from './socketio.js';
import { upload } from './oss/index.js';

const eta = (started: Date | string, progress: number) => {
  if (!started || progress <= 0 || progress > 1) return undefined;

  const elapsed =
    new Date().getTime() -
    (typeof started === 'string' ? new Date(started).getTime() : started.getTime());
  const remaining = (elapsed / progress) * (1 - progress);
  return remaining / 1000;
};

const report = async (
  key: string,
  webhook: Pick<Webhook, 'status' | 'progress' | 'eta' | 'target'> & Partial<Webhook>
) => {
  await redis.set(key, JSON.stringify(webhook), {
    expiration: {
      type: 'EX',
      value: 24 * 60 * 60
    }
  });
  const { status, progress, eta, target } = webhook;
  io.emit('message', target, status, progress, eta);
  console.log(`[Webhook] ${webhook.target}`, { status, progress, eta });
};

const downloadArtifactWithProgress = async (
  url: string,
  key: string,
  target: string
): Promise<Buffer> => {
  const started = new Date();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Unable to read artifact response stream');
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0');
  let receivedLength = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    receivedLength += value.length;

    if (contentLength > 0) {
      const progress = receivedLength / contentLength;
      await report(key, {
        status: 'downloading_artifact',
        progress,
        eta: eta(started, progress),
        target
      });
    }
  }

  return Buffer.concat(chunks);
};

const extractAndUploadFiles = async (
  zipBuffer: Buffer,
  key: string,
  hrid: string,
  target: string
): Promise<Array<{ name: string; url: string }>> => {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const outputFiles = [];

  for (const file of directory.files) {
    if (file.type === 'File') {
      const name = `[${hrid}] ${file.path.replace(/\//g, ' @ ')}`;
      const started = new Date();
      const url = await upload(name, await file.buffer(), (progress) => {
        report(key, {
          status: 'uploading_to_oss',
          progress,
          eta: eta(started, progress),
          target
        });
      });
      outputFiles.push({
        name,
        url
      });
    }
  }

  return outputFiles;
};

const getRun = async (id: string) => {
  const run = await db.getRun(id);
  if (!run) {
    throw new Error(`Run not found with ID ${id}`);
  }
  return run;
};

export const processWebhook = async (
  params: { owner: string; repo: string; id: string },
  payload: Webhook
) => {
  const key = `phizone:pa:run:${params.id}:${params.owner}/${params.repo}/${payload.runId}`;
  let webhook: Omit<Webhook, 'runId' | 'artifactId'>;
  const result = await redis.get(key);
  if (!result) {
    const run = await getRun(params.id);
    webhook = {
      status: payload.status,
      progress: payload.progress,
      eta: payload.eta,
      target: `${run.user}/${run.id}`
    };
    run.status = 'in_progress';
    await db.updateRun(run);
  } else {
    webhook = JSON.parse(result);

    webhook.status = payload.status;
    webhook.progress = payload.progress;
    webhook.eta = payload.eta;
  }

  if (payload.status === 'completed' && payload.artifactId) {
    const agent = github.getAgentByRepo(params.owner, params.repo);
    const response = await agent?.octokit.rest.actions.downloadArtifact({
      owner: params.owner,
      repo: params.repo,
      artifact_id: parseInt(payload.artifactId),
      archive_format: 'zip'
    });

    if (!response?.url) {
      throw new Error('Unable to obtain artifact download URL');
    }

    const run = await getRun(params.id);

    const zipBuffer = await downloadArtifactWithProgress(response.url, key, webhook.target);
    const outputFiles = await extractAndUploadFiles(zipBuffer, key, run.id, webhook.target);

    run.outputFiles = outputFiles;
    run.status = payload.status;
    run.dateCompleted = new Date();
    await db.updateRun(run);
  } else if (payload.status === 'failed' || payload.status === 'cancelled') {
    const run = await getRun(params.id);
    run.status = payload.status;
    run.dateCompleted = new Date();
    await db.updateRun(run);
  }

  await report(key, webhook);
};
