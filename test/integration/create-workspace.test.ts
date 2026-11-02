import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceWithFirstAdminInvite } from '../../src/app/workspaces/create-workspace.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const newWorkspace = { workspaceName: 'Xe tải Duy Khương', adminName: 'Duy' };
const now = new Date('2026-11-02T10:00:00+07:00');

describe('createWorkspaceWithFirstAdminInvite', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('draws a fresh code when the generated code is already taken', async () => {
    await createWorkspaceWithFirstAdminInvite(pool, newWorkspace, now, () => 'MOI-AAAAAA');

    const codes = ['MOI-AAAAAA', 'MOI-BBBBBB'];
    const result = await createWorkspaceWithFirstAdminInvite(pool, newWorkspace, now, () => {
      return codes.shift() ?? '';
    });

    expect(result).toMatchObject({ kind: 'created', inviteCode: 'MOI-BBBBBB' });
    expect(await database.query('SELECT count(*)::int AS n FROM workspace_invites')).toEqual([
      { n: 2 },
    ]);
    expect(await database.query('SELECT count(*)::int AS n FROM workspaces')).toEqual([{ n: 2 }]);
  });
});
