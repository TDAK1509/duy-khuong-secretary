import { describe, expect, it } from 'vitest';
import { loadConfig, readRuntimeDatabaseUrl } from '../../src/bootstrap/config.ts';

const DATABASE_URL = 'postgres://app_owner:app_owner@localhost:5432/secretary';

describe('loadConfig', () => {
  it('refuses the webhook alert provider without a webhook URL and names the value', () => {
    expect(() => loadConfig({ DATABASE_URL, ALERT_PROVIDER: 'webhook' })).toThrow(/ALERT_WEBHOOK_URL/);
  });

  it('reads the verification file when both values are set', () => {
    const config = loadConfig({
      DATABASE_URL,
      ZALO_VERIFIER_FILE_NAME: 'zalo_verifierABC.html',
      ZALO_VERIFIER_FILE_CONTENT: '<html>abc</html>',
    });

    expect(config.verifierFile).toEqual({ fileName: 'zalo_verifierABC.html', content: '<html>abc</html>' });
  });

  it('serves no verification file when only one of its values is set', () => {
    const config = loadConfig({ DATABASE_URL, ZALO_VERIFIER_FILE_NAME: 'zalo_verifierABC.html' });

    expect(config.verifierFile).toBeNull();
  });

  it('refuses a verification file name that is not a plain file name and names the value', () => {
    expect(() =>
      loadConfig({ DATABASE_URL, ZALO_VERIFIER_FILE_NAME: '../health', ZALO_VERIFIER_FILE_CONTENT: 'x' }),
    ).toThrow(/ZALO_VERIFIER_FILE_NAME/);
  });
});

describe('readRuntimeDatabaseUrl', () => {
  const MIGRATION_DATABASE_URL = 'postgresql://secretary:ownerpw@dpg-x-a/secretary';
  const APP_RUNTIME_PASSWORD = 'ab+cd/ef==';

  it('returns an explicit DATABASE_URL', () => {
    const url = readRuntimeDatabaseUrl({ DATABASE_URL, MIGRATION_DATABASE_URL, APP_RUNTIME_PASSWORD });

    expect(url).toBe(DATABASE_URL);
  });

  it('signs in as app_runtime on the migration host when DATABASE_URL is unset', () => {
    const url = readRuntimeDatabaseUrl({
      MIGRATION_DATABASE_URL: 'postgresql://secretary:ownerpw@dpg-x-a:5432/secretary?sslmode=require',
      APP_RUNTIME_PASSWORD,
    });

    const parsed = new URL(url ?? '');
    expect(parsed.username).toBe('app_runtime');
    expect(decodeURIComponent(parsed.password)).toBe('ab+cd/ef==');
    expect(`${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`).toBe(
      'postgresql://dpg-x-a:5432/secretary?sslmode=require',
    );
    expect(url).not.toContain('ownerpw');
  });
});
