import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/bootstrap/config.ts';

const DATABASE_URL = 'postgres://app_owner:app_owner@localhost:5432/secretary';

describe('loadConfig', () => {
  it('refuses the webhook alert provider without a webhook URL and names the value', () => {
    expect(() => loadConfig({ DATABASE_URL, ALERT_PROVIDER: 'webhook' })).toThrow(/ALERT_WEBHOOK_URL/);
  });
});
