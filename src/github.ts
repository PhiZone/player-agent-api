import { Octokit } from 'octokit';
import config from '../config.json' with { type: 'json' };
import type { RunCreate } from './schemas.js';
import { redis } from './redis.js';
import type { ObjectId } from 'mongodb';

export interface Agent {
  owner: string;
  repo: string;
  workflow: string;
  branch: string;
  octokit: Octokit;
}

export class GitHub {
  private agents: Agent[];

  constructor() {
    this.agents = config.agents.map((agent) => {
      const { owner, repo, workflow, branch, token } = agent;
      return {
        owner,
        repo,
        workflow,
        branch,
        octokit: new Octokit({
          auth: token,
          baseUrl:
            'githubApiUrl' in config && typeof config.githubApiUrl === 'string'
              ? config.githubApiUrl
              : undefined
        })
      };
    });
    console.log('[GitHub] Initialized.');
  }

  getAgentByRepo(owner: string, repo: string) {
    return this.agents.find((agent) => agent.owner === owner && agent.repo === repo);
  }

  async getQueuedRuns(agent: Agent) {
    const statuses = ['in_progress', 'queued', 'requested', 'waiting', 'pending'] as const;
    return await Promise.all(
      statuses.map((status) =>
        agent.octokit.rest.actions.listWorkflowRuns({
          owner: agent.owner,
          repo: agent.repo,
          workflow_id: agent.workflow,
          status
        })
      )
    );
  }

  async getAgent() {
    const results = await Promise.all(
      this.agents.map(async (agent) => {
        const results = await this.getQueuedRuns(agent);
        const runs = results
          .flatMap((result) => result.data.workflow_runs)
          .map((run: { id: number }) => run.id);
        const count = results.map((result) => result.data.total_count).reduce((a, b) => a + b, 0);

        const queueSize = count >= 5 ? count - 5 : 0;
        let queueTime = count >= 5 ? null : 0;

        if (queueTime === null) {
          for (const runId of runs) {
            const pattern = `phizone:pa:run:*:${agent.owner}/${agent.repo}/${runId}`;
            const keys = await redis.keys(pattern);
            let value: string | null = null;
            if (keys.length > 0) {
              value = await redis.get(keys[0]);
            }
            if (value) {
              try {
                const data = JSON.parse(value);
                if (typeof data.eta === 'number') {
                  if (queueTime === null || data.eta < queueTime) {
                    queueTime = data.eta;
                  }
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        return {
          agent,
          count,
          queueSize,
          queueTime
        };
      })
    );

    results.sort((a, b) =>
      a.queueTime && b.queueTime ? a.queueTime - b.queueTime : a.count - b.count
    );
    return results[0];
  }

  async requestRun(run: RunCreate, objectId: ObjectId, hrid: string) {
    const result = await this.getAgent();
    if (!result) {
      throw new Error('No available agents');
    }

    const { agent, queueSize, queueTime } = result;

    await agent.octokit.rest.actions.createWorkflowDispatch({
      owner: agent.owner,
      repo: agent.repo,
      workflow_id: agent.workflow,
      ref: agent.branch,
      inputs: {
        id: hrid,
        objectId: objectId.toString(),
        files: JSON.stringify([
          ...run.input.chartFiles,
          ...[run.input.respack || config.defaultRespack]
        ]),
        mediaOptions: JSON.stringify({ ...run.mediaOptions, vsync: true }),
        preferences: JSON.stringify({
          ...run.preferences,
          aspectRatio: null
        }),
        toggles: JSON.stringify({
          ...run.toggles,
          autostart: true,
          practice: false,
          adjustOffset: false,
          render: true,
          newTab: true,
          inApp: 2
        }),
        webhookUrl: `${config.webhookUrl}/${agent.owner}/${agent.repo}/${objectId}`,
        timezone: config.timezone,
        useSnapshot: config.useSnapshot,
        ...(run.input.title && { title: run.input.title }),
        ...(run.input.level && { level: run.input.level })
      }
    });
    console.log(`[GitHub] Requested run ${hrid} on ${agent.owner}/${agent.repo}`);

    return { queueSize, queueTime };
  }

  async cancelRun(objectId: ObjectId) {
    const pattern = `phizone:pa:run:${objectId}:*`;
    const key = (await redis.keys(pattern)).at(0);
    let owner, repo, runId;
    if (key) {
      const parts = key.split(':');
      [owner, repo, runId] = parts.pop()?.split('/') || [];
    } else {
      const result = (
        await Promise.all(
          this.agents.map((agent) =>
            this.getQueuedRuns(agent).then((r) =>
              r.flatMap((result) =>
                result.data.workflow_runs.map((run) => ({
                  agent,
                  run
                }))
              )
            )
          )
        )
      )
        .flat()
        .find((results) => results.run.name?.endsWith(`[${objectId}]`));
      if (!result) return undefined;
      owner = result.agent.owner;
      repo = result.agent.repo;
      runId = result.run.id;
    }
    const agent = this.getAgentByRepo(owner, repo);
    const response = await agent?.octokit.rest.actions.cancelWorkflowRun({
      owner,
      repo,
      run_id: Number(runId)
    });
    return response?.status;
  }

  async getArtifactUrl(owner: string, repo: string, artifactId: number): Promise<string> {
    const agent = github.getAgentByRepo(owner, repo);
    const response = await agent?.octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifactId,
      archive_format: 'zip'
    });

    if (!response?.url) {
      throw new Error('Unable to obtain artifact download URL');
    }
    return response.url;
  }
}

const github = new GitHub();
export default github;
