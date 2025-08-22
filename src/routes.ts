import { createRoute, z } from '@hono/zod-openapi';
import {
  ErrorSchema,
  QuerySchema,
  RunCreateSchema,
  RunListSchema,
  RunSchemaWithId,
  WebhookSchema
} from './schemas.js';

export const NewRun = createRoute({
  method: 'post',
  path: '/runs/new',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RunCreateSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Requests a new agent run',
      content: {
        'application/json': {
          schema: z.object({
            objectId: z.string().openapi({
              description: 'Object ID of the run'
            }),
            runId: z.string().openapi({
              description: 'Human-readable ID of the run'
            }),
            prefix: z.string().openapi({
              description: 'Prefix of the user identifier'
            }),
            queueSize: z.number().openapi({
              description: 'Number of runs in the queue',
              example: 2
            }),
            queueTime: z.number().nullable().openapi({
              description: 'Estimated time in seconds until the run is picked up',
              example: 30
            })
          })
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      }
    },
    409: {
      description: 'Conflict',
      content: {
        'application/json': {
          schema: RunSchemaWithId
        }
      }
    }
  }
});

export const GetRuns = createRoute({
  method: 'get',
  path: '/runs',
  request: {
    query: QuerySchema
  },
  responses: {
    200: {
      description: 'Fetches agent runs',
      content: {
        'application/json': {
          schema: RunListSchema
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      }
    }
  }
});

export const GetRun = createRoute({
  method: 'get',
  path: '/runs/{id}',
  request: {
    params: z.object({
      id: z.string().openapi({
        description: 'Object ID of the run (or human-readable ID, if query specified)'
      })
    }),
    query: z.object({
      user: z.string().optional().openapi({
        description: 'User identifier',
        example: '12345678'
      })
    })
  },
  responses: {
    200: {
      description: 'Fetches a specific agent run',
      content: {
        'application/json': {
          schema: RunSchemaWithId
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      }
    },
    404: {
      description: 'Run not found',
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      }
    }
  }
});

export const Webhook = createRoute({
  method: 'post',
  path: '/webhook/{owner}/{repo}/{id}',
  request: {
    params: z.object({
      owner: z.string().openapi({
        description: 'Owner of the hosting repository'
      }),
      repo: z.string().openapi({
        description: 'Name of the hosting repository'
      }),
      id: z.string().openapi({
        description: 'Object ID of the run',
        example: '5349b4ddd2781d08c09890f3'
      })
    }),
    body: {
      content: {
        'application/json': {
          schema: WebhookSchema
        }
      }
    }
  },
  responses: {
    204: {
      description: 'Webhook received'
    },
    404: {
      description: 'Run not found',
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      }
    }
  }
});

export const Overview = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Overview of the API',
      content: {
        'application/json': {
          schema: z.object({
            runCount: z.number().openapi({
              description: 'Total number of agent runs',
              example: 1000
            }),
            userCount: z.number().openapi({
              description: 'Total number of users',
              example: 50
            })
          })
        }
      }
    }
  }
});
