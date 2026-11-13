import { setTimeout } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCredits, chargeCall, type RecordedCall } from '../../src/app/credits/credit-balance.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { readCreditBalance, setCreditBalance } from './llm-call-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const LOCK_WAIT_LIMIT_MS = 2000;
const LOCK_WAIT_STEP_MS = 20;

type Signal = { promise: Promise<void>; send: () => void };

function makeSignal(): Signal {
  let send: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    send = resolve;
  });
  return { promise, send };
}

describe('the credit balance of a workspace', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  function makeTenCreditCall(): RecordedCall {
    return {
      workspaceId,
      kind: 'chat_answer',
      model: 'gpt-6-luna',
      usage: null,
      price: { costUsd: '0.006666667', credits: '10.000' },
      isCharged: true,
    };
  }

  it('gives two charges at the same time their own balance after', async () => {
    await setCreditBalance(database, workspaceId, 100);
    const firstCharged = makeSignal();
    const firstMayCommit = makeSignal();
    const first = runInTransaction(pool, async (transaction) => {
      await chargeCall(transaction, makeTenCreditCall());
      firstCharged.send();
      await firstMayCommit.promise;
    });
    await Promise.race([firstCharged.promise, first]);
    const second = runInTransaction(pool, (transaction) => chargeCall(transaction, makeTenCreditCall()));

    try {
      await waitUntilAChargeWaitsForALock();
    } finally {
      firstMayCommit.send();
      await Promise.allSettled([first, second]);
    }
    await Promise.all([first, second]);

    expect(await readCreditBalance(database, workspaceId)).toBe('80.000');
    expect(await database.query('SELECT balance_after FROM llm_calls ORDER BY balance_after DESC')).toEqual([
      { balance_after: '90.000' },
      { balance_after: '80.000' },
    ]);
  });

  async function waitUntilAChargeWaitsForALock(): Promise<void> {
    const giveUpAt = Date.now() + LOCK_WAIT_LIMIT_MS;
    while (Date.now() < giveUpAt) {
      const [row] = await database.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_locks lock JOIN pg_stat_activity session ON session.pid = lock.pid
         WHERE NOT lock.granted AND session.datname = current_database()`,
      );
      if (row && row.waiting > 0) return;
      await setTimeout(LOCK_WAIT_STEP_MS);
    }
    throw new Error('the second charge never waited for the lock of the first');
  }

  it('stores the balance after when credits are added', async () => {
    await setCreditBalance(database, workspaceId, 80);
    const duyId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });

    await runInTransaction(pool, (transaction) =>
      addCredits(transaction, { workspaceId, credits: '50.000', source: 'internal_user', addedBy: duyId, note: 'Nạp thử' }),
    );

    expect(await readCreditBalance(database, workspaceId)).toBe('130.000');
    expect(await database.query("SELECT credits, source, added_by, note, balance_after FROM credit_additions WHERE source = 'internal_user'")).toEqual([
      { credits: '50.000', source: 'internal_user', added_by: duyId, note: 'Nạp thử', balance_after: '130.000' },
    ]);
  });
});
