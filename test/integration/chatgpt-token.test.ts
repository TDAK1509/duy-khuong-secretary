import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashSecretToken } from '../../src/app/chatgpt/secret-token.ts';
import { removeMember } from '../../src/app/workspaces/remove-member.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { QrCodeGeneratorRenderer } from '../../src/providers/qr-code/qrcode-generator-renderer.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertConnection } from './chatgpt-connection-rows.ts';
import { insertConfirmedSignIn } from './chatgpt-sign-in-rows.ts';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * 60 * ONE_MINUTE_MS;
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('POST /oauth/token', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  describe('with an authorization code', () => {
    beforeEach(async () => {
      await insertConfirmedSignIn(database, {
        userId: duyUserId,
        authorizationCode: 'C1',
        codeChallenge: CODE_CHALLENGE,
        expiresAt: new Date(NOW.getTime() + 10 * ONE_MINUTE_MS),
      });
    });

    it('returns an access token and a refresh token for a valid code', async () => {
      const response = await requestToken(makeCodeRequest());

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: expect.any(String),
      });
    });

    it('stores only hashes of the tokens, for the membership of the admin', async () => {
      const response = await requestToken(makeCodeRequest());

      const { access_token: accessToken, refresh_token: refreshToken } = response.json();
      const [connection] = await database.query(
        `SELECT * FROM chatgpt_connections WHERE membership_id = (SELECT id FROM memberships WHERE user_id = '${duyUserId}')`,
      );
      expect(await database.query('SELECT id FROM chatgpt_connections')).toHaveLength(1);
      expect(Object.values(connection ?? {})).not.toContain(accessToken);
      expect(Object.values(connection ?? {})).not.toContain(refreshToken);
    });

    it('refuses a code that was already exchanged', async () => {
      await requestToken(makeCodeRequest());

      const response = await requestToken(makeCodeRequest());

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('refuses a wrong code verifier and creates no connection', async () => {
      const response = await requestToken(makeCodeRequest({ code_verifier: 'wrong-verifier-0000000000000000000000000000' }));

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
      expect(await database.query('SELECT id FROM chatgpt_connections')).toEqual([]);
    });

    it('refuses a code from a sign-in created 11 minutes ago', async () => {
      clock.advanceBy(11 * ONE_MINUTE_MS);

      const response = await requestToken(makeCodeRequest());

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('refuses a different redirect address', async () => {
      const response = await requestToken(makeCodeRequest({ redirect_uri: 'https://evil.example/cb' }));

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('refuses a resource other than the MCP address of the service', async () => {
      const response = await requestToken(makeCodeRequest({ resource: 'https://evil.example/mcp' }));

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('accepts a request without a resource', async () => {
      const response = await requestToken(makeFieldsWithout(makeCodeRequest(), 'resource'));

      expect(response.statusCode).toBe(200);
    });

    it('forbids caching the reply that holds the tokens', async () => {
      const response = await requestToken(makeCodeRequest());

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('with a refresh token', () => {
    beforeEach(async () => {
      await insertConnection(database, {
        userId: duyUserId,
        accessToken: 'A1',
        refreshToken: 'R1',
        refreshExpiresAt: new Date(NOW.getTime() + 30 * ONE_DAY_MS),
      });
    });

    it('returns a new access token and a new refresh token', async () => {
      const response = await requestToken(makeRefreshRequest());

      const { access_token: accessToken, refresh_token: refreshToken } = response.json();
      expect(response.statusCode).toBe(200);
      expect([accessToken, refreshToken]).not.toContain('A1');
      expect([accessToken, refreshToken]).not.toContain('R1');
      expect(await database.query('SELECT access_token_hash, refresh_token_hash FROM chatgpt_connections')).toEqual([
        { access_token_hash: hashSecretToken(accessToken), refresh_token_hash: hashSecretToken(refreshToken) },
      ]);
    });

    it('refuses a refresh token that was already used', async () => {
      await requestToken(makeRefreshRequest());

      const response = await requestToken(makeRefreshRequest());

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('refuses a refresh token that expired yesterday', async () => {
      clock.advanceBy(31 * ONE_DAY_MS);

      const response = await requestToken(makeRefreshRequest());

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
    });

    it('refuses the refresh token of an admin who was removed and deletes the connection', async () => {
      const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan', role: 'admin' });
      const [duy] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
      await removeMember(pool, { workspaceId, callerUserId: lanUserId, membershipId: duy?.id ?? '' });

      const response = await requestToken(makeRefreshRequest());

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_grant' });
      expect(await database.query('SELECT id FROM chatgpt_connections')).toEqual([]);
    });
  });

  it('refuses an unknown grant type', async () => {
    const response = await requestToken({ grant_type: 'client_credentials' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'unsupported_grant_type' });
  });

  it.each([
    ['grant_type', makeFieldsWithout(makeCodeRequest(), 'grant_type')],
    ['code', makeFieldsWithout(makeCodeRequest(), 'code')],
    ['code_verifier', makeFieldsWithout(makeCodeRequest(), 'code_verifier')],
    ['redirect_uri', makeFieldsWithout(makeCodeRequest(), 'redirect_uri')],
    ['client_id of a code request', makeFieldsWithout(makeCodeRequest(), 'client_id')],
    ['refresh_token', makeFieldsWithout(makeRefreshRequest(), 'refresh_token')],
    ['client_id of a refresh request', makeFieldsWithout(makeRefreshRequest(), 'client_id')],
  ])('refuses a request without %s', async (_missingField, fields) => {
    const response = await requestToken(fields);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
  });

  it.each([
    ['a code request', makeCodeRequest({ client_id: 'https://other.example/client.json' })],
    ['a refresh request', makeRefreshRequest({ client_id: 'https://other.example/client.json' })],
  ])('refuses a client other than ChatGPT in %s', async (_kind, fields) => {
    const response = await requestToken(fields);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
  });

  it.each([
    ['an unknown grant type', { grant_type: 'client_credentials' }],
    ['a missing grant type', {}],
    ['an unknown code', makeCodeRequest()],
    ['an unknown refresh token', makeRefreshRequest()],
  ])('forbids caching the reply to %s', async (_kind, fields) => {
    const response = await requestToken(fields);

    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  function makeFieldsWithout(fields: Record<string, string>, name: string): Record<string, string> {
    return Object.fromEntries(Object.entries(fields).filter(([field]) => field !== name));
  }

  function makeCodeRequest(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      grant_type: 'authorization_code',
      code: 'C1',
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: CHATGPT_REDIRECT_URI,
      code_verifier: CODE_VERIFIER,
      resource: `${PUBLIC_BASE_URL}/mcp`,
      ...overrides,
    };
  }

  function makeRefreshRequest(overrides: Record<string, string> = {}): Record<string, string> {
    return { grant_type: 'refresh_token', refresh_token: 'R1', client_id: CHATGPT_CLIENT_ID, ...overrides };
  }

  function requestToken(fields: Record<string, string>) {
    const server = buildServer(pool, null, {
      signIn: { database: pool, clock, publicBaseUrl: PUBLIC_BASE_URL, qrCode: new QrCodeGeneratorRenderer() },
    });
    return server.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(fields).toString(),
    });
  }
});
