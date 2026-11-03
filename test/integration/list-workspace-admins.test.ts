import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorkspaceAdmins } from '../../src/app/access/list-workspace-admins.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('listWorkspaceAdmins', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const otherWorkspaceId = await insertWorkspace(database, 'Xe khách Vy');
    await insertMember(database, {
      workspaceId,
      externalUserId: 'zu-khuong',
      displayName: 'Khương',
      role: 'admin',
      joinedAt: new Date('2026-10-02T10:00:00+07:00'),
    });
    await insertMember(database, {
      workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
      joinedAt: new Date('2026-10-01T10:00:00+07:00'),
    });
    await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  function listAdmins() {
    return runInTransaction(pool, (transaction) => listWorkspaceAdmins(transaction, workspaceId));
  }

  async function findMembershipId(displayName: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE display_name = '${displayName}'`);
    if (!row) throw new Error(`no membership for ${displayName}`);
    return row.id;
  }

  it('lists every admin of the workspace with their Zalo account, oldest membership first', async () => {
    expect(await listAdmins()).toEqual([
      {
        membershipId: await findMembershipId('Duy'),
        recipient: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-duy' },
      },
      {
        membershipId: await findMembershipId('Khương'),
        recipient: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-khuong' },
      },
    ]);
  });
});
