import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptToken } from '../../src/app/channel-auth/token-cipher.ts';
import { createPkcePair, sealConnectState } from '../../src/app/channel-auth/connect-state.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeChannelAuth, makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const ENCRYPTION_KEY = 'a'.repeat(64);
const NOW = new Date('2026-11-02T10:00:00+07:00');

describe('GET /oauth/zalo/callback', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let channelAuth: FakeChannelAuth;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    channelAuth = new FakeChannelAuth();
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('stores the connection after a valid callback', async () => {
    const state = makeState(new Date('2026-11-02T09:59:00+07:00'));

    const response = await callCallback({ oa_id: 'oa-1', code: 'k1', state });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Zalo OA oa-1 connected.');
    expect(await database.query('SELECT account_id FROM channel_connections')).toEqual([{ account_id: 'oa-1' }]);
  });

  it('stores the keys encrypted', async () => {
    channelAuth.exchangeResult = {
      ok: true,
      tokens: makeTokenPair({ accessToken: 'a1-plain', refreshToken: 'r1-plain' }),
    };

    await callCallback({ oa_id: 'oa-1', code: 'k1', state: makeState(NOW) });

    const [row] = await database.query<Record<string, unknown>>('SELECT * FROM channel_connections');
    const storedValues = Object.values(row ?? {}).map(String);
    expect(storedValues.some((value) => value.includes('a1-plain') || value.includes('r1-plain'))).toBe(false);
    expect(decryptToken(String(row?.['access_token_encrypted']), ENCRYPTION_KEY)).toBe('a1-plain');
  });

  it('replaces the keys when the same OA connects again', async () => {
    await callCallback({ oa_id: 'oa-1', code: 'k1', state: makeState(NOW) });
    channelAuth.exchangeResult = { ok: true, tokens: makeTokenPair({ accessToken: 'a2' }) };

    await callCallback({ oa_id: 'oa-1', code: 'k2', state: makeState(NOW) });

    const rows = await database.query<{ access_token_encrypted: string }>(
      'SELECT access_token_encrypted FROM channel_connections',
    );
    expect(rows).toHaveLength(1);
    expect(decryptToken(rows[0]?.access_token_encrypted ?? '', ENCRYPTION_KEY)).toBe('a2');
  });

  it('refuses a tampered state without calling Zalo', async () => {
    const response = await callCallback({ oa_id: 'oa-1', code: 'k1', state: 'bad' });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Zalo connection failed. Run connect-zalo again.');
    expect(channelAuth.exchanges).toEqual([]);
  });

  it('refuses an expired state and stores nothing', async () => {
    const state = makeState(new Date('2026-11-02T09:29:00+07:00'));

    const response = await callCallback({ oa_id: 'oa-1', code: 'k1', state });

    expect(response.statusCode).toBe(400);
    expect(await database.query('SELECT id FROM channel_connections')).toEqual([]);
    expect(channelAuth.exchanges).toEqual([]);
  });

  function makeState(madeAt: Date): string {
    return sealConnectState(createPkcePair().verifier, madeAt, ENCRYPTION_KEY);
  }

  function callCallback(query: Record<string, string>) {
    const server = buildServer(pool, null, {
      oauthCallback: { database: pool, channelAuth, encryptionKey: ENCRYPTION_KEY, clock: new FakeClock(NOW) },
    });
    return server.inject({ method: 'GET', url: '/oauth/zalo/callback', query });
  }
});
