import { z } from 'zod';

const environmentSchema = z
  .object({
    DATABASE_URL: z.url(),
    GIT_COMMIT: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    ALERT_PROVIDER: z.enum(['log', 'webhook']).default('log'),
    ALERT_WEBHOOK_URL: z.url().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.ALERT_PROVIDER === 'webhook' && !environment.ALERT_WEBHOOK_URL) {
      context.addIssue({
        code: 'custom',
        path: ['ALERT_WEBHOOK_URL'],
        message: 'is required when ALERT_PROVIDER is webhook',
      });
    }
  });

export type AlertConfig = { provider: 'log' } | { provider: 'webhook'; webhookUrl: string };

export type Config = {
  commit: string | null;
  databaseUrl: string;
  port: number;
  alert: AlertConfig;
};

export function loadConfig(environment: NodeJS.ProcessEnv): Config {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  }
  return {
    commit: parsed.data.GIT_COMMIT || parsed.data.RENDER_GIT_COMMIT || null,
    databaseUrl: parsed.data.DATABASE_URL,
    port: parsed.data.PORT,
    alert: readAlertConfig(parsed.data),
  };
}

function readAlertConfig(environment: z.infer<typeof environmentSchema>): AlertConfig {
  if (environment.ALERT_PROVIDER === 'log' || !environment.ALERT_WEBHOOK_URL) return { provider: 'log' };
  return { provider: 'webhook', webhookUrl: environment.ALERT_WEBHOOK_URL };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
