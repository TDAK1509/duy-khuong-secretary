import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaAuth } from '../../src/providers/channel-auth/zalo-oa-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { replyWithJson, startStubHttpServer, type StubAnswer, type StubHttpServer } from './stub-http-server.ts';

const VALID_TOKEN_ANSWER = replyWithJson({ access_token: 'a1', refresh_token: 'r1', expires_in: '90000' });

describe('ZaloOaAuth against a stub Zalo OAuth server', () => {
  const servers: StubHttpServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('sends the app secret header and the code verifier when it exchanges a code', async () => {
    const { auth, server } = await startAuth(VALID_TOKEN_ANSWER);

    await auth.exchangeAuthorization({ code: 'k1', codeVerifier: 'v1' });

    const [request] = server.requests;
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/v4/oa/access_token');
    expect(request?.headers['secret_key']).toBe('sec-1');
    expect(Object.fromEntries(new URLSearchParams(request?.body))).toEqual({
      app_id: 'app-1',
      code: 'k1',
      code_verifier: 'v1',
      grant_type: 'authorization_code',
    });
  });

  async function startAuth(answer: StubAnswer): Promise<{ auth: ZaloOaAuth; server: StubHttpServer }> {
    const server = await startStubHttpServer(answer);
    servers.push(server);
    const auth = new ZaloOaAuth({
      appId: 'app-1',
      appSecret: 'sec-1',
      oauthBaseUrl: server.baseUrl,
      timeoutMs: 5000,
      clock: new FakeClock(new Date('2026-11-02T10:00:00+07:00')),
    });
    return { auth, server };
  }
});
