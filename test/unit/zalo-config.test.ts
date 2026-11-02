import { describe, expect, it } from 'vitest';
import { loadZaloConfig } from '../../src/bootstrap/zalo-config.ts';

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

  it('reads the values with the default OAuth base URL', () => {
    expect(loadZaloConfig(COMPLETE_ENVIRONMENT)).toEqual({
      ok: true,
      config: {
        provider: 'zalo-oa',
        oauthTimeoutMs: 15_000,
        appId: 'app-1',
        appSecret: 'sec-1',
        oauthBaseUrl: 'https://oauth.zaloapp.com',
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
});
