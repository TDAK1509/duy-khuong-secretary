import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the member tools of an admin', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let workspaceId: string;
  let duy: AccessScope;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(new Date('2026-11-02T14:05:00+07:00'));
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  async function runTool(name: string, args: object, scope: AccessScope = duy): Promise<string> {
    return runAdminTool({ database: pool, clock }, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  describe('creating an invite', () => {
    it('stores the invite for the workspace of the caller', async () => {
      await runTool('create_invite', { display_name: 'Hùng', role: 'member' });

      const invites = await database.query(
        'SELECT workspace_id, display_name, role, used_at, created_by FROM workspace_invites',
      );
      expect(invites).toEqual([
        { workspace_id: workspaceId, display_name: 'Hùng', role: 'member', used_at: null, created_by: duy.userId },
      ]);
    });
  });
});
