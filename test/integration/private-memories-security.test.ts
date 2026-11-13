import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertPrivateMemory } from './private-memory-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const ROW_LEVEL_SECURITY_VIOLATION = '42501';

describe('the private memories for the runtime role', () => {
  let database: TemporaryDatabase;
  let runtimePool: PostgresPool;
  let workspaceId: string;
  let lanUserId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await runtimePool.end();
    await database.drop();
  });

  it('shows the owner scope its own memory', async () => {
    await insertPrivateMemory(database, { workspaceId, userId: lanUserId, markdown: '- Tôi lái xe 29C-123.45' });

    const rows = await selectMemories({ workspaceId, ownerUserId: lanUserId });

    expect(rows).toEqual([{ author_user_id: lanUserId, fact: 'Tôi lái xe 29C-123.45' }]);
  });

  it('shows another member\'s owner scope no memory of the first member', async () => {
    await insertPrivateMemory(database, { workspaceId, userId: lanUserId, markdown: '- Tôi lái xe 29C-123.45' });

    const rows = await selectMemories({ workspaceId, ownerUserId: hungUserId });

    expect(rows).toEqual([]);
  });

  it('shows the workspace scope of the admin tools no memory', async () => {
    await insertPrivateMemory(database, { workspaceId, userId: lanUserId, markdown: '- Tôi lái xe 29C-123.45' });
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });

    const rows = await selectMemories({ workspaceId });

    expect(rows).toEqual([]);
  });

  it('refuses to write a memory for another user', async () => {
    const insert = runInTransaction(scopeDatabase(runtimePool, { workspaceId, ownerUserId: lanUserId }), (transaction) =>
      transaction.query(`INSERT INTO private_memories (workspace_id, author_user_id, fact) VALUES ($1, $2, 'A')`, [workspaceId, hungUserId]),
    );

    await expect(insert).rejects.toMatchObject({ code: ROW_LEVEL_SECURITY_VIOLATION });
  });

  async function selectMemories(scope: { workspaceId: string; ownerUserId?: string }): Promise<object[]> {
    return runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query('SELECT author_user_id, fact FROM private_memories'),
    );
  }
});
