import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertUserMemory } from './user-memory-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the user memories for the runtime role', () => {
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
    await insertUserMemory(database, { workspaceId, userId: lanUserId, markdown: '- Tôi lái xe 29C-123.45' });

    const rows = await selectMemories({ workspaceId, ownerUserId: lanUserId });

    expect(rows).toEqual([{ user_id: lanUserId, markdown: '- Tôi lái xe 29C-123.45' }]);
  });

  async function selectMemories(scope: { workspaceId: string; ownerUserId?: string }): Promise<object[]> {
    return runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query('SELECT user_id, markdown FROM user_memories'),
    );
  }
});
