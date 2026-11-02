import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaAuth } from '../../src/providers/channel-auth/zalo-oa-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { replyWithJson, staySilent, startStubHttpServer, type StubAnswer, type StubHttpServer } from './stub-http-server.ts';

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

  it('turns a token answer into a key pair with its expiry times', async () => {
    const { auth } = await startAuth(VALID_TOKEN_ANSWER);

    const result = await auth.exchangeAuthorization({ code: 'k1', codeVerifier: 'v1' });

    expect(result).toEqual({
      ok: true,
      tokens: {
        accessToken: 'a1',
        refreshToken: 'r1',
        accessExpiresAt: new Date('2026-11-03T11:00:00+07:00'),
        refreshExpiresAt: new Date('2027-01-31T10:00:00+07:00'),
      },
    });
  });

  it('sends the renewal key when it renews', async () => {
    const { auth, server } = await startAuth(VALID_TOKEN_ANSWER);

    await auth.refresh('r1');

    const [request] = server.requests;
    expect(request?.headers['secret_key']).toBe('sec-1');
    expect(Object.fromEntries(new URLSearchParams(request?.body))).toEqual({
      app_id: 'app-1',
      refresh_token: 'r1',
      grant_type: 'refresh_token',
    });
  });

  it('turns a Zalo error answer into rejected', async () => {
    const { auth } = await startAuth(replyWithJson({ error: -14014, message: 'Invalid refresh token' }));

    const result = await auth.refresh('r1');

    expect(result).toEqual({ ok: false, reason: 'rejected' });
  });

  it('turns a refused connection into unavailable', async () => {
    const { auth, server } = await startAuth(VALID_TOKEN_ANSWER);
    await server.close();

    const result = await auth.refresh('r1');

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('turns a timeout after sending into no answer', async () => {
    const { auth } = await startAuth(staySilent, 100);

    const result = await auth.refresh('r1');

    expect(result).toEqual({ ok: false, reason: 'no_answer' });
  });

  it('turns a server error answer to a renewal into no answer', async () => {
    const { auth } = await startAuth({ kind: 'reply', status: 502, body: 'Bad Gateway' });

    const result = await auth.refresh('r1');

    expect(result).toEqual({ ok: false, reason: 'no_answer' });
  });

  async function startAuth(
    answer: StubAnswer,
    timeoutMs = 5000,
  ): Promise<{ auth: ZaloOaAuth; server: StubHttpServer }> {
    const server = await startStubHttpServer(answer);
    servers.push(server);
    const auth = new ZaloOaAuth({
      appId: 'app-1',
      appSecret: 'sec-1',
      oauthBaseUrl: server.baseUrl,
      timeoutMs,
      clock: new FakeClock(new Date('2026-11-02T10:00:00+07:00')),
    });
    return { auth, server };
  }
});
