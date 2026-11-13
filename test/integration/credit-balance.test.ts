import { setTimeout } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chargeCall, type RecordedCall } from '../../src/app/credits/credit-balance.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { readCreditBalance, setCreditBalance } from './llm-call-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertWorkspace } from './workspace-rows.ts';

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
    const secondStarted = Promise.withResolvers<void>();

    await Promise.all([
      runInTransaction(pool, async (transaction) => {
        await chargeCall(transaction, makeTenCreditCall());
        await secondStarted.promise;
        await setTimeout(50);
      }),
      runInTransaction(pool, async (transaction) => {
        secondStarted.resolve();
        await chargeCall(transaction, makeTenCreditCall());
      }),
    ]);

    expect(await readCreditBalance(database, workspaceId)).toBe('80.000');
    expect(await database.query('SELECT balance_after FROM llm_calls ORDER BY balance_after DESC')).toEqual([
      { balance_after: '90.000' },
      { balance_after: '80.000' },
    ]);
  });
});
