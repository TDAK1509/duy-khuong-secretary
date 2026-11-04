import { z } from 'zod';

const DATABASE_URL_PROBLEM =
  'DATABASE_URL must be a database URL, or MIGRATION_DATABASE_URL and APP_RUNTIME_PASSWORD must both be set';
const PLAIN_FILE_NAME = /^[A-Za-z0-9._-]+$/;

const environmentSchema = z
  .object({
    GIT_COMMIT: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    ALERT_PROVIDER: z.enum(['log', 'webhook']).default('log'),
    ALERT_WEBHOOK_URL: z.url().optional(),
    ZALO_VERIFIER_FILE_NAME: z.string().regex(PLAIN_FILE_NAME, 'must be a plain file name').or(z.literal('')).optional(),
    ZALO_VERIFIER_FILE_CONTENT: z.string().optional(),
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
  verifierFile: VerifierFile | null;
};

export type VerifierFile = { fileName: string; content: string };

export function loadConfig(environment: NodeJS.ProcessEnv): Config {
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment) ?? '');
  if (!databaseUrl.success) {
    throw new Error(`Invalid configuration: ${DATABASE_URL_PROBLEM}`);
  }
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  }
  return {
    commit: parsed.data.GIT_COMMIT || parsed.data.RENDER_GIT_COMMIT || null,
    databaseUrl: databaseUrl.data,
    port: parsed.data.PORT,
    alert: readAlertConfig(parsed.data),
    verifierFile: readVerifierFile(parsed.data),
  };
}

export const RUNTIME_ROLE = 'app_runtime';

export function readRuntimeDatabaseUrl(environment: NodeJS.ProcessEnv): string | null {
  const explicitUrl = environment['DATABASE_URL'];
  if (explicitUrl) return explicitUrl;
  const migrationUrl = environment['MIGRATION_DATABASE_URL'];
  const password = environment['APP_RUNTIME_PASSWORD'];
  if (!migrationUrl || !password) return null;
  return signInAsRuntimeRole(migrationUrl, password);
}

function signInAsRuntimeRole(migrationUrl: string, password: string): string {
  const url = new URL(migrationUrl);
  url.username = RUNTIME_ROLE;
  url.password = password;
  return url.toString();
}

function readAlertConfig(environment: z.infer<typeof environmentSchema>): AlertConfig {
  if (environment.ALERT_PROVIDER === 'log' || !environment.ALERT_WEBHOOK_URL) return { provider: 'log' };
  return { provider: 'webhook', webhookUrl: environment.ALERT_WEBHOOK_URL };
}

function readVerifierFile(environment: z.infer<typeof environmentSchema>): VerifierFile | null {
  const fileName = environment.ZALO_VERIFIER_FILE_NAME;
  const content = environment.ZALO_VERIFIER_FILE_CONTENT;
  if (!fileName || !content) return null;
  return { fileName, content };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
