import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorkspaceLabels } from '../../src/app/records/list-workspace-labels.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('listWorkspaceLabels', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  function listLabels(): Promise<string[]> {
    return runInTransaction(pool, (transaction) => listWorkspaceLabels(transaction, workspaceId));
  }

  function saveRecord(labels: string[]): Promise<string> {
    return insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: labels.map((label) => ({ label, value: 'giá trị' })),
    });
  }

  it('lists the labels used by most records first', async () => {
    await saveRecord(['Trọng lượng hàng']);
    await saveRecord(['Nơi nhận']);
    await saveRecord(['Trọng lượng hàng']);
    await saveRecord(['Trọng lượng hàng']);

    expect(await listLabels()).toEqual(['Trọng lượng hàng', 'Nơi nhận']);
  });
});
