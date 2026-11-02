import { describe, expect, it } from 'vitest';
import { ZaloOaAuth } from '../../src/providers/channel-auth/zalo-oa-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';

describe('ZaloOaAuth.authorizationUrl', () => {
  it('carries the app id, redirect URL, challenge and state', () => {
    const auth = new ZaloOaAuth({
      appId: 'app-1',
      appSecret: 'sec-1',
      oauthBaseUrl: 'https://oauth.zaloapp.com',
      timeoutMs: 15000,
      clock: new FakeClock(new Date('2026-11-02T10:00:00+07:00')),
    });

    const link = new URL(
      auth.authorizationUrl({
        state: 's1',
        codeChallenge: 'c1',
        redirectUri: 'https://x.test/oauth/zalo/callback',
      }),
    );

    expect(link.pathname).toBe('/v4/oa/permission');
    expect(Object.fromEntries(link.searchParams)).toEqual({
      app_id: 'app-1',
      redirect_uri: 'https://x.test/oauth/zalo/callback',
      code_challenge: 'c1',
      state: 's1',
    });
  });
});
