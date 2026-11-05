import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { QrCodeGeneratorRenderer } from '../../src/providers/qr-code/qrcode-generator-renderer.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertConfirmedSignIn } from './chatgpt-sign-in-rows.ts';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, PUBLIC_BASE_URL } from './chatgpt-sign-in-requests.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_MINUTE_MS = 60 * 1000;
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('POST /oauth/token', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
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
        expiresAt: new Date(NOW.getTime() + 5 * ONE_MINUTE_MS),
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
  });

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
