import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCredits, chargeCall, type RecordedCall } from '../../src/app/credits/credit-balance.ts';
import { readCreditHistory } from '../../src/app/internal-admin/read-credit-history.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeSignal, waitUntilATransactionWaitsForALock } from './lock-signals.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { readCreditBalance, setCreditBalance } from './llm-call-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

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
      charged: { clock: new FakeClock(new Date('2026-11-02T10:00:00+07:00')), maxTextLength: 2000 },
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
      await waitUntilATransactionWaitsForALock(database);
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

  it('times a charge when it is made, not when its transaction began', async () => {
    await setCreditBalance(database, workspaceId, 100);
    const firstBegan = makeSignal();
    const secondCommitted = makeSignal();
    const first = runInTransaction(pool, async (transaction) => {
      await transaction.query('SELECT 1');
      firstBegan.send();
      await secondCommitted.promise;
      await chargeCall(transaction, makeTenCreditCall());
    });
    await Promise.race([firstBegan.promise, first]);

    await runInTransaction(pool, (transaction) => chargeCall(transaction, makeTenCreditCall()));
    secondCommitted.send();
    await first;

    expect(await database.query('SELECT balance_after FROM llm_calls ORDER BY created_at DESC, id DESC')).toEqual([
      { balance_after: '80.000' },
      { balance_after: '90.000' },
    ]);
    const groups = await readCreditHistory(pool, workspaceId, new Date(Date.now() + 60 * 1000));
    expect(groups.map((group) => (group.type === 'usage' ? group.calls : 0)).reduce((total, calls) => total + calls, 0)).toBe(2);
    expect(groups[0]).toMatchObject({ type: 'usage', balanceAfter: '80.000' });
  });

  it('times an addition when it is made, not when its transaction began', async () => {
    await setCreditBalance(database, workspaceId, 100);
    const duyId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const addition = { workspaceId, credits: '10.000', source: 'internal_user', addedBy: duyId, note: 'Nạp thử' } as const;
    const firstBegan = makeSignal();
    const secondCommitted = makeSignal();
    const first = runInTransaction(pool, async (transaction) => {
      await transaction.query('SELECT 1');
      firstBegan.send();
      await secondCommitted.promise;
      await addCredits(transaction, addition);
    });
    await Promise.race([firstBegan.promise, first]);

    await runInTransaction(pool, (transaction) => addCredits(transaction, addition));
    secondCommitted.send();
    await first;

    expect(await database.query('SELECT balance_after FROM credit_additions ORDER BY created_at DESC, id DESC')).toEqual([
      { balance_after: '120.000' },
      { balance_after: '110.000' },
    ]);
  });

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

  it('adds credits once when a second addition with the same id waits for the first', async () => {
    await setCreditBalance(database, workspaceId, 80);
    const duyId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const addition = { id: randomUUID(), workspaceId, credits: '50.000', source: 'internal_user', addedBy: duyId, note: 'Nạp thử' } as const;
    const firstAdded = makeSignal();
    const firstMayCommit = makeSignal();
    const first = runInTransaction(pool, async (transaction) => {
      await addCredits(transaction, addition);
      firstAdded.send();
      await firstMayCommit.promise;
    });
    await Promise.race([firstAdded.promise, first]);
    const second = runInTransaction(pool, (transaction) => addCredits(transaction, addition));

    try {
      await waitUntilATransactionWaitsForALock(database);
    } finally {
      firstMayCommit.send();
      await Promise.allSettled([first, second]);
    }
    await Promise.all([first, second]);

    expect(await readCreditBalance(database, workspaceId)).toBe('130.000');
    expect(await database.query('SELECT balance_after FROM credit_additions')).toEqual([{ balance_after: '130.000' }]);
  });
});
