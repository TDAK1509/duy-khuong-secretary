import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorkspaceLabels } from '../../src/app/records/list-workspace-labels.ts';
import { toDatabaseScope } from '../../src/app/access/to-database-scope.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow, insertRecordRows } from './record-rows.ts';
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

  it('lists the labels used by most records first', async () => {
    await saveRecord(['Trọng lượng hàng']);
    await saveRecord(['Nơi nhận']);
    await saveRecord(['Trọng lượng hàng']);
    await saveRecord(['Trọng lượng hàng']);

    expect(await listLabels()).toEqual(['Trọng lượng hàng', 'Nơi nhận']);
  });

  it('counts a label repeated inside one record once', async () => {
    await saveRecord(['Nơi nhận', 'Nơi nhận']);
    await saveRecord(['Hàng hóa']);
    await saveRecord(['Hàng hóa']);

    expect(await listLabels()).toEqual(['Hàng hóa', 'Nơi nhận']);
  });

  it('never loads the labels of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe khách Vy');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy' });
    await insertRecordRow(database, {
      workspaceId: otherWorkspaceId,
      userId: vyUserId,
      senderName: 'Vy',
      details: [{ label: 'Số công tơ', value: '123' }],
    });
    await saveRecord(['Nơi nhận']);

    expect(await listLabels()).toEqual(['Nơi nhận']);
  });

  it('does not count the records of another workspace toward the newest 500', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe khách Vy');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy' });
    await saveRecord(['Nhãn A']);
    await insertRecordRows(database, {
      workspaceId: otherWorkspaceId,
      userId: vyUserId,
      senderName: 'Vy',
      label: 'Nhãn B',
      count: 600,
      firstCreatedAt: new Date('2026-11-01T10:00:00+07:00'),
    });

    expect(await listLabels()).toEqual(['Nhãn A']);
  });

  it('shows a member the labels saved by the other members of the workspace', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await saveRecord(['Trọng lượng hàng']);
    const lanDatabase = scopeDatabase(pool, toDatabaseScope({ workspaceId, userId: lanUserId, role: 'member' }));

    const labels = await runInTransaction(lanDatabase, (transaction) => listWorkspaceLabels(transaction, workspaceId));

    expect(labels).toEqual(['Trọng lượng hàng']);
  });

  it('lists at most 30 labels', async () => {
    const thirtyOneLabels = Array.from({ length: 31 }, (_, index) => `Nhãn ${String(index).padStart(2, '0')}`);
    await saveRecord(thirtyOneLabels);

    expect(await listLabels()).toHaveLength(30);
  });

  it('leaves out a label longer than 60 characters', async () => {
    await saveRecord(['a'.repeat(61)]);

    expect(await listLabels()).toEqual([]);
  });

  it('keeps a label of exactly 60 characters', async () => {
    await saveRecord(['a'.repeat(60)]);

    expect(await listLabels()).toEqual(['a'.repeat(60)]);
  });

  it('leaves out a label used only beyond the newest 500 records', async () => {
    await saveRecord(['Nhãn cũ']);
    await saveNewerRecords('Nhãn mới', 500);

    expect(await listLabels()).toEqual(['Nhãn mới']);
  });

  it('keeps a label used inside the newest 500 records', async () => {
    await saveRecord(['Nhãn cũ']);
    await saveNewerRecords('Nhãn mới', 499);

    expect(await listLabels()).toEqual(['Nhãn mới', 'Nhãn cũ']);
  });

  function saveRecord(labels: string[]): Promise<string> {
    return insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: labels.map((label) => ({ label, value: 'giá trị' })),
    });
  }

  function saveNewerRecords(label: string, count: number): Promise<void> {
    return insertRecordRows(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      label,
      count,
      firstCreatedAt: new Date('2026-11-01T10:00:00+07:00'),
    });
  }

  function listLabels(): Promise<string[]> {
    return runInTransaction(pool, (transaction) => listWorkspaceLabels(transaction, workspaceId));
  }
});
