import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { insertMemberMemory } from './member-memory-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const ROW_LEVEL_SECURITY_VIOLATION = '42501';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const PLATE_FACT = '- Lái xe biển số 93A-1234';

describe('the member memories for the runtime role', () => {
  let database: TemporaryDatabase;
  let runtimePool: PostgresPool;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await runtimePool.end();
    await database.drop();
  });

  it('shows the workspace scope the facts of a member', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: PLATE_FACT });

    const rows = await selectMemories({ workspaceId });

    expect(rows).toEqual([{ user_id: hungUserId, markdown: PLATE_FACT }]);
  });

  it('shows the owner scope of the member no facts', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: PLATE_FACT });

    const rows = await selectMemories({ workspaceId, ownerUserId: hungUserId });

    expect(rows).toEqual([]);
  });

  it('refuses to write facts in an owner scope', async () => {
    const insert = runInTransaction(scopeDatabase(runtimePool, { workspaceId, ownerUserId: hungUserId }), (transaction) =>
      transaction.query(`INSERT INTO member_memories (workspace_id, user_id, markdown) VALUES ($1, $2, '- A')`, [workspaceId, hungUserId]),
    );

    await expect(insert).rejects.toMatchObject({ code: ROW_LEVEL_SECURITY_VIOLATION });
  });

  it('shows the workspace scope of another workspace no facts', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: PLATE_FACT });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');

    const rows = await selectMemories({ workspaceId: otherWorkspaceId });

    expect(rows).toEqual([]);
  });

  async function selectMemories(scope: { workspaceId: string; ownerUserId?: string }): Promise<object[]> {
    return runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query('SELECT user_id, markdown FROM member_memories'),
    );
  }
});
