import { describe, expect, it } from 'vitest';
import { loadZaloConfig, loadZaloWebhookConfig } from '../../src/bootstrap/zalo-config.ts';

const COMPLETE_ENVIRONMENT: NodeJS.ProcessEnv = {
  MESSAGING_PROVIDER: 'zalo-oa',
  ZALO_APP_ID: 'app-1',
  ZALO_APP_SECRET: 'sec-1',
  CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUBLIC_BASE_URL: 'https://x.test',
};

describe('loadZaloConfig', () => {
  it('lists every missing value by name', () => {
    const result = loadZaloConfig({ ...COMPLETE_ENVIRONMENT, ZALO_APP_ID: undefined, PUBLIC_BASE_URL: '' });

    expect(result).toEqual({ ok: false, missing: ['ZALO_APP_ID', 'PUBLIC_BASE_URL'] });
  });

  it('reads the values with the default base URLs, timeout and send rate', () => {
    expect(loadZaloConfig(COMPLETE_ENVIRONMENT)).toEqual({
      ok: true,
      config: {
        provider: 'zalo-oa',
        oauthTimeoutMs: 15_000,
        appId: 'app-1',
        appSecret: 'sec-1',
        oauthBaseUrl: 'https://oauth.zaloapp.com',
        apiBaseUrl: 'https://openapi.zalo.me',
        apiTimeoutMs: 15_000,
        outboundMaxPerMinute: 90,
        encryptionKey: 'a'.repeat(64),
        publicBaseUrl: 'https://x.test',
      },
    });
  });

  it('refuses an encryption key that is not 64 hex characters and names the value', () => {
    const environment = { ...COMPLETE_ENVIRONMENT, CHANNEL_TOKEN_ENCRYPTION_KEY: 'short' };

    expect(() => loadZaloConfig(environment)).toThrow(/CHANNEL_TOKEN_ENCRYPTION_KEY/);
  });

  it('refuses a messaging provider other than zalo-oa and names the value', () => {
    expect(() => loadZaloConfig({ ...COMPLETE_ENVIRONMENT, MESSAGING_PROVIDER: 'other' })).toThrow(/MESSAGING_PROVIDER/);
  });

  it('refuses a supplied invalid value even when other values are missing', () => {
    const environment = { MESSAGING_PROVIDER: 'other', PUBLIC_BASE_URL: 'not a url' };

    expect(() => loadZaloConfig(environment)).toThrow(/MESSAGING_PROVIDER.*PUBLIC_BASE_URL/);
  });
});

describe('loadZaloWebhookConfig', () => {
  it('reads the app id and the OA secret when the zalo group is on', () => {
    const result = loadZaloWebhookConfig({ ...COMPLETE_ENVIRONMENT, ZALO_OA_SECRET: 'oa-sec-1' });

    expect(result).toEqual({ ok: true, config: { provider: 'zalo-oa', appId: 'app-1', oaSecret: 'oa-sec-1' } });
  });

  it('names the OA secret when only it is missing', () => {
    expect(loadZaloWebhookConfig(COMPLETE_ENVIRONMENT)).toEqual({ ok: false, missing: ['ZALO_OA_SECRET'] });
  });

  it('lists the missing zalo values before the OA secret', () => {
    const result = loadZaloWebhookConfig({ ...COMPLETE_ENVIRONMENT, ZALO_APP_ID: '', ZALO_OA_SECRET: '' });

    expect(result).toEqual({ ok: false, missing: ['ZALO_APP_ID', 'ZALO_OA_SECRET'] });
  });

  it('names only the zalo values when just the OA secret is set', () => {
    const result = loadZaloWebhookConfig({ ...COMPLETE_ENVIRONMENT, PUBLIC_BASE_URL: '', ZALO_OA_SECRET: 'oa-sec-1' });

    expect(result).toEqual({ ok: false, missing: ['PUBLIC_BASE_URL'] });
  });
});
