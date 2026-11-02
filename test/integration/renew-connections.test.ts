import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptToken } from '../../src/app/channel-auth/token-cipher.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runTick } from '../../src/app/ticker/run-tick.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeChannelAuth, makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const ENCRYPTION_KEY = 'a'.repeat(64);
const NOW = new Date('2026-11-02T10:00:00+07:00');

describe('key renewal on the ticker', () => {
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

  it('renews a key that expires within the hour', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshResult = { ok: true, tokens: makeTokenPair({ accessToken: 'a2', refreshToken: 'r2' }) };

    await runOneTick();

    const [row] = await database.query<{ access_token_encrypted: string; refreshed_at: Date }>(
      'SELECT access_token_encrypted, refreshed_at FROM channel_connections',
    );
    expect(decryptToken(row?.access_token_encrypted ?? '', ENCRYPTION_KEY)).toBe('a2');
    expect(row?.refreshed_at).toEqual(NOW);
    expect(channelAuth.refreshes).toEqual(['r1']);
  });

  it('leaves a key that expires in two hours alone', async () => {
    await storeConnectionExpiringIn(120);

    await runOneTick();

    expect(channelAuth.refreshes).toEqual([]);
  });

  it('renews once when two ticks start at the same moment', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshDelayMs = 200;

    await Promise.all([runOneTick(), runOneTick()]);

    expect(channelAuth.refreshes).toHaveLength(1);
  });

  function storeConnectionExpiringIn(minutes: number, accountId = 'oa-1'): Promise<void> {
    const accessExpiresAt = new Date(NOW.getTime() + minutes * 60_000);
    return storeConnection(
      pool,
      {
        channel: 'zalo-oa',
        accountId,
        tokens: makeTokenPair({ accessToken: 'a1', refreshToken: 'r1', accessExpiresAt }),
        storedAt: new Date('2026-11-01T10:00:00+07:00'),
      },
      ENCRYPTION_KEY,
    );
  }

  function runOneTick(): Promise<void> {
    return runTick({
      renewal: { database: pool, channelAuth, encryptionKey: ENCRYPTION_KEY, clock: new FakeClock(NOW) },
    });
  }
});
