import { setTimeout } from 'node:timers/promises';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAlerts } from '../../src/app/alerts/operator-alerts.ts';
import { decryptToken } from '../../src/app/channel-auth/token-cipher.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runTick } from '../../src/app/ticker/run-tick.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeAlertSink } from '../fakes/fake-alert-sink.ts';
import { FakeChannelAuth, makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const ENCRYPTION_KEY = 'a'.repeat(64);
const CALL_TIMEOUT_MS = 15_000;
const NOW = new Date('2026-11-02T10:00:00+07:00');

describe('key renewal on the ticker', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let channelAuth: FakeChannelAuth;
  let alertSink: FakeAlertSink;
  let clock: FakeClock;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    channelAuth = new FakeChannelAuth();
    alertSink = new FakeAlertSink();
    clock = new FakeClock(NOW);
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
    let endCall: () => void = () => {};
    const callMayEnd = new Promise<void>((resolve) => (endCall = resolve));
    channelAuth.duringRefresh = async () => {
      if (channelAuth.refreshes.length > 1) endCall();
      await callMayEnd;
    };
    const rowLock = await lockConnectionRow();

    const ticks = [runOneTick(), runOneTick()];
    await waitUntilTwoClaimsQueue();
    await rowLock.query('COMMIT');
    await Promise.race(ticks);
    endCall();
    await Promise.all(ticks);

    expect(channelAuth.refreshes).toHaveLength(1);
  });

  it('alerts the operator when a renewal is rejected', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshResult = { ok: false, reason: 'rejected' };

    await runOneTick();

    expect(alertSink.texts).toEqual([
      '[alert] Zalo key renewal failed for OA oa-1 (rejected). If it keeps failing, run connect-zalo again.',
    ]);
  });

  it('keeps the stored keys when a renewal is rejected', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshResult = { ok: false, reason: 'rejected' };

    await runOneTick();

    const [row] = await database.query<{ access_token_encrypted: string }>(
      'SELECT access_token_encrypted FROM channel_connections',
    );
    expect(decryptToken(row?.access_token_encrypted ?? '', ENCRYPTION_KEY)).toBe('a1');
  });

  it('requires reauthorization and keeps the keys when a renewal gets no answer', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshResult = { ok: false, reason: 'no_answer' };

    await runOneTick();

    const [row] = await database.query<{ status: string; access_token_encrypted: string }>(
      'SELECT status, access_token_encrypted FROM channel_connections',
    );
    expect(row?.status).toBe('reauthorization_required');
    expect(decryptToken(row?.access_token_encrypted ?? '', ENCRYPTION_KEY)).toBe('a1');
  });

  it('sends the reauthorization alert when a renewal gets no answer', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshResult = { ok: false, reason: 'no_answer' };

    await runOneTick();

    expect(alertSink.texts).toEqual([
      '[alert] Zalo key renewal got no answer for OA oa-1. Automatic renewal is stopped. Run connect-zalo again.',
    ]);
  });

  it('never renews a connection that requires reauthorization', async () => {
    await storeConnectionExpiringIn(30);
    await database.query(`UPDATE channel_connections SET status = 'reauthorization_required'`);

    await runOneTick();

    expect(channelAuth.refreshes).toEqual([]);
  });

  it('marks the renewal in progress and holds no row lock while Zalo has not answered', async () => {
    await storeConnectionExpiringIn(30);
    let duringCall: { renewal_started_at: Date | null; lockedRows: number } | null = null;
    channelAuth.duringRefresh = async () => {
      const [marker] = await database.query<{ renewal_started_at: Date | null }>(
        'SELECT renewal_started_at FROM channel_connections',
      );
      const lockable = await database.query('SELECT id FROM channel_connections FOR UPDATE NOWAIT');
      duringCall = { renewal_started_at: marker?.renewal_started_at ?? null, lockedRows: lockable.length };
    };

    await runOneTick();

    expect(duringCall).toEqual({ renewal_started_at: NOW, lockedRows: 1 });
    const [after] = await database.query<{ renewal_started_at: Date | null }>(
      'SELECT renewal_started_at FROM channel_connections',
    );
    expect(after?.renewal_started_at).toBeNull();
  });

  it('never retries a renewal whose outcome is unknown after a crash', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshError = new Error('process died after sending');
    await expect(runOneTick()).rejects.toThrow('process died after sending');
    clock.advanceBy(CALL_TIMEOUT_MS + 1);

    await runOneTick();

    const [row] = await database.query<{ status: string }>('SELECT status FROM channel_connections');
    expect(row?.status).toBe('reauthorization_required');
    expect(channelAuth.refreshes).toHaveLength(1);
    expect(alertSink.texts).toEqual([
      '[alert] Zalo key renewal got no answer for OA oa-1. Automatic renewal is stopped. Run connect-zalo again.',
    ]);
  });

  it('leaves a renewal alone while its call may still be running', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.refreshError = new Error('process died after sending');
    await expect(runOneTick()).rejects.toThrow();
    clock.advanceBy(CALL_TIMEOUT_MS - 1);

    await runOneTick();

    const [row] = await database.query<{ status: string }>('SELECT status FROM channel_connections');
    expect(row?.status).toBe('active');
    expect(channelAuth.refreshes).toHaveLength(1);
    expect(alertSink.texts).toEqual([]);
  });

  it('ignores a renewed key that arrives after the OA connected again', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.duringRefresh = reconnectWithNewKeys;
    channelAuth.refreshResult = { ok: true, tokens: makeTokenPair({ accessToken: 'late-renewal' }) };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runOneTick();

    const [row] = await database.query<{ status: string; access_token_encrypted: string }>(
      'SELECT status, access_token_encrypted FROM channel_connections',
    );
    expect(decryptToken(row?.access_token_encrypted ?? '', ENCRYPTION_KEY)).toBe('reconnected');
    expect(row?.status).toBe('active');
    expect(logged).toHaveBeenCalledWith('[renewal] ignored a result for OA oa-1: the connection changed during the call');
    logged.mockRestore();
  });

  it('does not stop a reconnected OA when a late renewal got no answer', async () => {
    await storeConnectionExpiringIn(30);
    channelAuth.duringRefresh = reconnectWithNewKeys;
    channelAuth.refreshResult = { ok: false, reason: 'no_answer' };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runOneTick();

    const [row] = await database.query<{ status: string }>('SELECT status FROM channel_connections');
    expect(row?.status).toBe('active');
    expect(alertSink.texts).toEqual([]);
    logged.mockRestore();
  });

  async function lockConnectionRow(): Promise<pg.Client> {
    const session = await database.openSession();
    await session.query('BEGIN');
    await session.query('SELECT id FROM channel_connections FOR UPDATE');
    return session;
  }

  async function waitUntilTwoClaimsQueue(): Promise<void> {
    while ((await countWaitingLocks()) < 2) await setTimeout(10);
  }

  async function countWaitingLocks(): Promise<number> {
    const [row] = await database.query<{ waiting: string }>(
      `SELECT count(*) AS waiting
         FROM pg_locks JOIN pg_stat_activity USING (pid)
        WHERE NOT granted AND datname = current_database()`,
    );
    return Number(row?.waiting);
  }

  async function reconnectWithNewKeys(): Promise<void> {
    await storeConnection(
      pool,
      {
        channel: 'zalo-oa',
        accountId: 'oa-1',
        tokens: makeTokenPair({ accessToken: 'reconnected' }),
        storedAt: NOW,
      },
      ENCRYPTION_KEY,
    );
  }

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
      renewal: {
        database: pool,
        channelAuth,
        encryptionKey: ENCRYPTION_KEY,
        clock,
        callTimeoutMs: CALL_TIMEOUT_MS,
        alerts: new OperatorAlerts(alertSink, clock),
      },
    });
  }
});
