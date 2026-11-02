import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/bootstrap/config.ts';

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
});
