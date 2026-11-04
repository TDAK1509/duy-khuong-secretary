import { z } from 'zod';

const ZALO_OAUTH_TIMEOUT_MS = 15_000;
const DEFAULT_ZALO_API_TIMEOUT_MS = 15_000;
const DEFAULT_OUTBOUND_MAX_PER_MINUTE = 90;
const MIN_OUTBOUND_MAX_PER_MINUTE = 2;
const DEFAULT_MEDIA_HOSTS = 'zdn.vn,zadn.vn';

const REQUIRED_NAMES = [
  'MESSAGING_PROVIDER',
  'ZALO_APP_ID',
  'ZALO_APP_SECRET',
  'CHANNEL_TOKEN_ENCRYPTION_KEY',
  'PUBLIC_BASE_URL',
];

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const BASE64_KEY_OF_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

const environmentSchema = z.object({
  MESSAGING_PROVIDER: z.literal('zalo-oa'),
  ZALO_APP_ID: z.string(),
  ZALO_APP_SECRET: z.string(),
  CHANNEL_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(isEncryptionKey, 'must be 64 hex characters or base64 of 32 bytes')
    .transform(toHexKey),
  PUBLIC_BASE_URL: z.url(),
  ZALO_OAUTH_BASE_URL: z.url().default('https://oauth.zaloapp.com'),
  ZALO_API_BASE_URL: z.url().default('https://openapi.zalo.me'),
  ZALO_BUSINESS_API_BASE_URL: z.url().default('https://openapi.zalo.me'),
  ZALO_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_ZALO_API_TIMEOUT_MS),
  ZALO_MEDIA_HOSTS: z.string().default(DEFAULT_MEDIA_HOSTS),
  OUTBOUND_MAX_PER_MINUTE: z.coerce.number().int().min(MIN_OUTBOUND_MAX_PER_MINUTE).default(DEFAULT_OUTBOUND_MAX_PER_MINUTE),
});

export type ZaloConfig = {
  provider: 'zalo-oa';
  oauthTimeoutMs: number;
  appId: string;
  appSecret: string;
  oauthBaseUrl: string;
  apiBaseUrl: string;
  businessApiBaseUrl: string;
  apiTimeoutMs: number;
  mediaHosts: string[];
  outboundMaxPerMinute: number;
  encryptionKey: string;
  publicBaseUrl: string;
};

export type ZaloConfigResult = { ok: true; config: ZaloConfig } | { ok: false; missing: string[] };

export function loadZaloConfig(environment: NodeJS.ProcessEnv): ZaloConfigResult {
  const supplied = withRenderPublicUrl(dropEmptyValues(environment));
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
      apiBaseUrl: settings.ZALO_API_BASE_URL,
      businessApiBaseUrl: settings.ZALO_BUSINESS_API_BASE_URL,
      apiTimeoutMs: settings.ZALO_TIMEOUT_MS,
      mediaHosts: settings.ZALO_MEDIA_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
      outboundMaxPerMinute: settings.OUTBOUND_MAX_PER_MINUTE,
      encryptionKey: settings.CHANNEL_TOKEN_ENCRYPTION_KEY,
      publicBaseUrl: settings.PUBLIC_BASE_URL,
    },
  };
}

export type ZaloWebhookConfig = { provider: 'zalo-oa'; appId: string; oaSecret: string };

export type ZaloWebhookConfigResult = { ok: true; config: ZaloWebhookConfig } | { ok: false; missing: string[] };

export function loadZaloWebhookConfig(environment: NodeJS.ProcessEnv): ZaloWebhookConfigResult {
  const zalo = loadZaloConfig(environment);
  const oaSecret = environment['ZALO_OA_SECRET'] ?? '';
  if (zalo.ok && oaSecret) {
    return { ok: true, config: { provider: zalo.config.provider, appId: zalo.config.appId, oaSecret } };
  }
  const missing = [...(zalo.ok ? [] : zalo.missing), ...(oaSecret ? [] : ['ZALO_OA_SECRET'])];
  return { ok: false, missing };
}

function isEncryptionKey(value: string): boolean {
  return HEX_KEY.test(value) || BASE64_KEY_OF_32_BYTES.test(value);
}

function toHexKey(value: string): string {
  return HEX_KEY.test(value) ? value : Buffer.from(value, 'base64').toString('hex');
}

function dropEmptyValues(environment: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(environment).filter((entry): entry is [string, string] => !!entry[1]);
  return Object.fromEntries(entries);
}

function withRenderPublicUrl(supplied: Record<string, string>): Record<string, string> {
  const renderUrl = supplied['RENDER_EXTERNAL_URL'];
  if (!renderUrl || supplied['PUBLIC_BASE_URL']) return supplied;
  return { ...supplied, PUBLIC_BASE_URL: renderUrl };
}

function checkSuppliedValues(supplied: Record<string, string>): void {
  const parsed = environmentSchema.partial().safeParse(supplied);
  if (!parsed.success) throw new Error(`Invalid configuration: ${describeIssues(parsed.error)}`);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
}
