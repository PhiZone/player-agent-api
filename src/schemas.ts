import { z } from '@hono/zod-openapi';
import { ObjectId } from 'mongodb';

export const QuerySchema = z
  .object({
    user: z
      .string()
      .transform((val) => val.toLowerCase())
      .openapi({
        description: 'User identifier',
        example: '12345678'
      }),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val) : undefined))
      .pipe(z.number().int().optional())
      .openapi({
        description: 'Page number'
      }),
    limit: z
      .string()
      .transform((val) => parseInt(val))
      .pipe(z.number().int().min(1).max(100))
      .default('20')
      .openapi({
        description: 'Number of items per page',
        example: '20'
      })
  })
  .openapi('Query');

export const InputSchema = z.object({
  chartFiles: z.array(z.string()).openapi({
    description: 'List of chart file URLs',
    example: ['https://res.example.com/input1.pez', 'https://res.example.com/input2.zip']
  }),
  respack: z.string().optional().openapi({
    description: 'Resource pack file URL',
    example: 'https://res.example.com/respack.zip'
  })
});

export const MediaOptionsSchema = z
  .object({
    frameRate: z.number().min(1).openapi({
      description: 'Frame rate',
      example: 60
    }),
    overrideResolution: z
      .array(z.number())
      .length(2)
      .openapi({
        description: 'Resolution',
        example: [2160, 1440]
      }),
    resultsLoopsToRender: z.number().openapi({
      description: 'Number of results loops to render',
      example: 1
    }),
    videoCodec: z.string().openapi({
      description: 'Video codec',
      example: 'libx264'
    }),
    videoBitrate: z.number().min(1).openapi({
      description: 'Video bitrate',
      example: 6000
    }),
    audioBitrate: z.number().min(1).openapi({
      description: 'Audio bitrate',
      example: 320
    })
  })
  .openapi({
    description: 'Renderer media options'
  });

export const PreferencesSchema = z
  .object({
    backgroundBlur: z.number().optional().default(1).openapi({
      description: 'Background blur amount',
      example: 1
    }),
    backgroundLuminance: z.number().optional().default(0.5).openapi({
      description: 'Background luminance',
      example: 0.5
    }),
    chartFlipping: z.number().optional().default(0).openapi({
      description: 'Chart flipping mode',
      example: 0
    }),
    chartOffset: z.number().optional().default(0).openapi({
      description: 'Chart offset',
      example: 0
    }),
    fcApIndicator: z.boolean().optional().default(true).openapi({
      description: 'Show FC/AP indicator',
      example: true
    }),
    hitSoundVolume: z.number().optional().default(0.75).openapi({
      description: 'Hit sound volume',
      example: 0.75
    }),
    lineThickness: z.number().optional().default(1).openapi({
      description: 'Line thickness',
      example: 1
    }),
    musicVolume: z.number().optional().default(1).openapi({
      description: 'Music volume',
      example: 1
    }),
    noteSize: z.number().optional().default(1).openapi({
      description: 'Note size',
      example: 1
    }),
    simultaneousNoteHint: z.boolean().optional().default(true).openapi({
      description: 'Show simultaneous note hint',
      example: true
    })
  })
  .optional()
  .default({
    backgroundBlur: 1,
    backgroundLuminance: 0.5,
    chartFlipping: 0,
    chartOffset: 0,
    fcApIndicator: true,
    hitSoundVolume: 0.75,
    lineThickness: 1,
    musicVolume: 1,
    noteSize: 1,
    simultaneousNoteHint: true
  })
  .openapi({
    description: 'Player preferences'
  });

export const TogglesSchema = z.object({
  autoplay: z.boolean().optional().default(true).openapi({
    description: 'Enable autoplay',
    example: true
  })
});

export const OutputFilesSchema = z
  .array(
    z.object({
      name: z.string().openapi({
        example: '[Thunderstorm] Avantgarde [IN 16] @ 2025-08-21_03-21-25.mp4'
      }),
      url: z.string().url().optional().openapi({
        example: 'https://res.example.com/output1.mp4'
      }),
      artifact: z
        .object({
          owner: z.string().openapi({
            description: 'Owner of the hosting repository of the artifact',
            example: 'PhiZone'
          }),
          repo: z.string().openapi({
            description: 'Hosting repository of the artifact',
            example: 'player-agent'
          }),
          artifactId: z.number().openapi({
            description: 'ID of the artifact',
            example: 12345
          })
        })
        .optional()
    })
  )
  .openapi({
    description: 'List of output files',
    example: [
      {
        name: '[Thunderstorm] Avantgarde [IN 16] @ 2025-08-21_03-21-25.mp4',
        url: 'https://res.example.com/output1.mp4'
      }
    ]
  });

export const RunCreateSchema = z
  .object({
    input: InputSchema,
    mediaOptions: MediaOptionsSchema,
    preferences: PreferencesSchema,
    toggles: TogglesSchema,
    user: z.string().openapi({
      description: 'User identifier',
      example: '12345678'
    })
  })
  .openapi('RunCreate');

export const RunSchema = z
  .object({
    id: z.string().openapi({
      description: 'Human-readable ID of the run',
      example: 'Thunderstorm'
    }),
    user: z.string().openapi({
      description: 'User identifier',
      example: 'qq/12345678'
    }),
    input: InputSchema,
    mediaOptions: MediaOptionsSchema,
    preferences: PreferencesSchema,
    toggles: TogglesSchema,
    outputFiles: OutputFilesSchema,
    status: z.string().openapi({
      description: 'Status of the run',
      example: 'completed'
    }),
    dateCreated: z.date().openapi({
      description: 'Date when the run was created'
    }),
    dateCompleted: z.date().optional().openapi({
      description: 'Date when the run was completed'
    })
  })
  .openapi('Run');

export const RunSchemaWithId = RunSchema.extend({
  _id: z.instanceof(ObjectId).openapi({
    description: 'MongoDB ObjectId'
  })
});

export const RunListSchema = z.object({
  total: z.number().openapi({
    description: 'Total number of runs',
    example: 100
  }),
  runs: z.array(RunSchemaWithId).openapi({
    description: 'List of runs'
  })
});

export const WebhookSchema = z
  .object({
    runId: z.string().optional(),
    run_id: z.string().optional(),
    hrid: z.string().optional(),
    status: z.string().openapi({
      description: 'Status of the run',
      example: 'completed'
    }),
    progress: z.number().min(0).max(1).openapi({
      description: 'Progress of the run',
      example: 1
    }),
    artifactId: z.string().optional(),
    artifact_id: z.string().optional(),
    target: z.string().optional().openapi({
      description: 'Target identifier',
      example: 'qq/12345678/Thunderstorm'
    }),
    eta: z.number().min(0).optional().openapi({
      description: 'Estimated time of accomplishment in seconds',
      example: 60
    })
  })
  .transform((data) => ({
    runId: data.runId || data.run_id!,
    status: data.status,
    progress: data.progress,
    artifactId: data.artifactId || data.artifact_id,
    target: data.target || '',
    eta: data.eta
  }))
  .openapi({
    description: 'Webhook payload',
    example: {
      runId: 'Thunderstorm',
      status: 'completed',
      progress: 1,
      artifactId: '12345'
    }
  });

export const ErrorSchema = z.object({
  error: z.string().openapi({
    description: 'Error message'
  })
});

export type Query = z.infer<typeof QuerySchema>;
export type RunCreate = z.infer<typeof RunCreateSchema>;
export type OutputFiles = z.infer<typeof OutputFilesSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Webhook = z.infer<typeof WebhookSchema>;
