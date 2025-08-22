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
      return {
        owner: agent.owner,
        repo: agent.repo,
        workflow: agent.workflow,
        branch: agent.branch,
        octokit: new Octokit({ auth: agent.token })
      };
    });
    console.log('[GitHub] Initialized.');
  }

  getAgentByRepo(owner: string, repo: string) {
    return this.agents.find((agent) => agent.owner === owner && agent.repo === repo);
  }

  async getAgent() {
    const results = await Promise.all(
      this.agents.map(async (agent) => {
        const statuses = ['in_progress', 'queued', 'requested', 'waiting', 'pending'] as const;
        const runResults = await Promise.all(
          statuses.map((status) =>
            agent.octokit.rest.actions.listWorkflowRuns({
              owner: agent.owner,
              repo: agent.repo,
              workflow_id: agent.workflow,
              status
            })
          )
        );

        const runs = runResults
          .flatMap((result) => result.data.workflow_runs)
          .map((run: { id: number }) => run.id);
        const count = runResults
          .map((result) => result.data.total_count)
          .reduce((a, b) => a + b, 0);

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
        useSnapshot: config.useSnapshot
      }
    });
    console.log(`[GitHub] Requested run ${hrid} on ${agent.owner}/${agent.repo}`);

    return { queueSize, queueTime };
  }
}

const github = new GitHub();
export default github;
