import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPkcePair, sealConnectState } from '../../src/app/channel-auth/connect-state.ts';
import { buildServer } from '../../src/bootstrap/server.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeChannelAuth } from '../fakes/fake-channel-auth.ts';
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
