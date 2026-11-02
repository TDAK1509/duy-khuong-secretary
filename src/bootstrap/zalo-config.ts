import { z } from 'zod';

const REQUIRED_NAMES = [
  'MESSAGING_PROVIDER',
  'ZALO_APP_ID',
  'ZALO_APP_SECRET',
  'CHANNEL_TOKEN_ENCRYPTION_KEY',
  'PUBLIC_BASE_URL',
];

const environmentSchema = z.object({
  MESSAGING_PROVIDER: z.literal('zalo-oa'),
  CHANNEL_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters'),
  PUBLIC_BASE_URL: z.url(),
  ZALO_OAUTH_BASE_URL: z.url().default('https://oauth.zaloapp.com'),
});

export type ZaloConfig = {
  provider: 'zalo-oa';
  appId: string;
  appSecret: string;
  oauthBaseUrl: string;
  encryptionKey: string;
  publicBaseUrl: string;
};

export type ZaloConfigResult = { ok: true; config: ZaloConfig } | { ok: false; missing: string[] };

export function loadZaloConfig(environment: NodeJS.ProcessEnv): ZaloConfigResult {
  const missing = REQUIRED_NAMES.filter((name) => !environment[name]);
  if (missing.length > 0) return { ok: false, missing };
  const settings = parseSettings(environment);
  return {
    ok: true,
    config: {
      provider: settings.MESSAGING_PROVIDER,
      appId: environment['ZALO_APP_ID'] ?? '',
      appSecret: environment['ZALO_APP_SECRET'] ?? '',
      oauthBaseUrl: settings.ZALO_OAUTH_BASE_URL,
      encryptionKey: settings.CHANNEL_TOKEN_ENCRYPTION_KEY,
      publicBaseUrl: settings.PUBLIC_BASE_URL,
    },
  };
}

function parseSettings(environment: NodeJS.ProcessEnv): z.infer<typeof environmentSchema> {
  const parsed = environmentSchema.safeParse({ ...environment, ZALO_OAUTH_BASE_URL: environment['ZALO_OAUTH_BASE_URL'] || undefined });
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
