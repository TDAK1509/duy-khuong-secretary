import { z } from 'zod';

const ZALO_OAUTH_TIMEOUT_MS = 15_000;

const REQUIRED_NAMES = [
  'MESSAGING_PROVIDER',
  'ZALO_APP_ID',
  'ZALO_APP_SECRET',
  'CHANNEL_TOKEN_ENCRYPTION_KEY',
  'PUBLIC_BASE_URL',
];

const environmentSchema = z.object({
  MESSAGING_PROVIDER: z.literal('zalo-oa'),
  ZALO_APP_ID: z.string(),
  ZALO_APP_SECRET: z.string(),
  CHANNEL_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters'),
  PUBLIC_BASE_URL: z.url(),
  ZALO_OAUTH_BASE_URL: z.url().default('https://oauth.zaloapp.com'),
});

export type ZaloConfig = {
  provider: 'zalo-oa';
  oauthTimeoutMs: number;
  appId: string;
  appSecret: string;
  oauthBaseUrl: string;
  encryptionKey: string;
  publicBaseUrl: string;
};

export type ZaloConfigResult = { ok: true; config: ZaloConfig } | { ok: false; missing: string[] };

export function loadZaloConfig(environment: NodeJS.ProcessEnv): ZaloConfigResult {
  const supplied = dropEmptyValues(environment);
  checkSuppliedValues(supplied);
  const missing = REQUIRED_NAMES.filter((name) => !supplied[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = environmentSchema.parse(supplied);
  return {
    ok: true,
    config: {
      provider: settings.MESSAGING_PROVIDER,
      oauthTimeoutMs: ZALO_OAUTH_TIMEOUT_MS,
      appId: settings.ZALO_APP_ID,
      appSecret: settings.ZALO_APP_SECRET,
      oauthBaseUrl: settings.ZALO_OAUTH_BASE_URL,
      encryptionKey: settings.CHANNEL_TOKEN_ENCRYPTION_KEY,
      publicBaseUrl: settings.PUBLIC_BASE_URL,
    },
  };
}

function dropEmptyValues(environment: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(environment).filter((entry): entry is [string, string] => !!entry[1]);
  return Object.fromEntries(entries);
}

function checkSuppliedValues(supplied: Record<string, string>): void {
  const parsed = environmentSchema.partial().safeParse(supplied);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
