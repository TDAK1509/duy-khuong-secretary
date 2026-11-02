import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import type { ChannelIdentity } from '../../src/app/identities/channel-identity.ts';
import { findPersonWorkspace } from '../../src/app/workspaces/find-person-workspace.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

describe('finding the workspace of a person', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let firstWorkspaceId: string;
  let secondWorkspaceId: string;
  let thirdWorkspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    firstWorkspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    secondWorkspaceId = await insertWorkspace(database, 'Xe tải Phụ');
    thirdWorkspaceId = await insertWorkspace(database, 'Xe tải Ba');
    userId = await insertMember(database, {
      workspaceId: firstWorkspaceId,
      externalUserId: 'zu-hung',
      displayName: 'Hùng',
      joinedAt: new Date('2026-10-01T10:00:00+07:00'),
    });
    await insertMembership(database, {
      workspaceId: secondWorkspaceId,
      userId,
      displayName: 'Hùng',
      joinedAt: new Date('2026-10-05T10:00:00+07:00'),
    });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('falls back to the earliest membership when the current workspace is not a membership', async () => {
    const workspaceId = await findWorkspaceWithCurrent(thirdWorkspaceId);

    expect(workspaceId).toBe(firstWorkspaceId);
  });

  it('uses the current workspace when it is one of the memberships', async () => {
    const workspaceId = await findWorkspaceWithCurrent(secondWorkspaceId);

    expect(workspaceId).toBe(secondWorkspaceId);
  });

  function findWorkspaceWithCurrent(currentWorkspaceId: string): Promise<string | null> {
    const identity: ChannelIdentity = { id: 'unused', userId, currentWorkspaceId, pendingChoice: null };
    return runInTransaction(pool, (transaction) => findPersonWorkspace(transaction, identity));
  }
});
