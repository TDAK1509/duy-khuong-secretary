import { describe, expect, it } from 'vitest';
import { runConnectZaloCommand } from '../../src/bootstrap/connect-zalo.ts';

const ZALO_ENVIRONMENT: NodeJS.ProcessEnv = {
  MESSAGING_PROVIDER: 'zalo-oa',
  ZALO_APP_ID: 'app-1',
  ZALO_APP_SECRET: 'sec-1',
  CHANNEL_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  PUBLIC_BASE_URL: 'https://x.test',
};

describe('the connect-zalo command', () => {
  it('prints a link whose redirect URL is our callback', () => {
    const lines: string[] = [];

    const exitCode = runConnectZaloCommand(ZALO_ENVIRONMENT, { log: (line) => lines.push(line) });

    expect(exitCode).toBe(0);
    expect(lines[0]).toBe('Open this link while logged in to Zalo as an OA admin, then approve:');
    const link = new URL(lines[1] ?? '');
    expect(link.pathname).toBe('/v4/oa/permission');
    expect(link.searchParams.get('redirect_uri')).toBe('https://x.test/oauth/zalo/callback');
    expect(link.searchParams.get('app_id')).toBe('app-1');
  });

  it('refuses while Zalo is not configured', () => {
    const lines: string[] = [];

    const exitCode = runConnectZaloCommand(
      { ...ZALO_ENVIRONMENT, ZALO_APP_SECRET: undefined },
      { log: (line) => lines.push(line) },
    );

    expect(exitCode).toBe(1);
    expect(lines).toEqual(['zalo is not configured: missing ZALO_APP_SECRET.']);
  });
});
