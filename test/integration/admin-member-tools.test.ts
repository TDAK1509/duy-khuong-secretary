import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
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
    const tokens = makeTokenPair({ accessToken: 'a1' });
    await storeConnection(pool, { channel: 'zalo-oa', accountId: 'oa-1', tokens, storedAt: clock.now() }, 'a'.repeat(64));
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

    it('answers with the code, the role label and the expiry', async () => {
      const output = await runTool('create_invite', { display_name: 'Hùng', role: 'member' });

      expect(JSON.parse(output)).toMatchObject({
        ok: true,
        code: expect.stringMatching(/^MOI-[A-Z2-9]{6}$/),
        display_name: 'Hùng',
        role: 'thành viên',
        expires: '14:05 09/11/2026',
      });
    });

    it('answers with the link to the chat of the connected OA', async () => {
      const output = await runTool('create_invite', { display_name: 'Hùng', role: 'member' });

      expect(JSON.parse(output)).toMatchObject({ oa_link: 'https://zalo.me/oa-1' });
    });

    it('refuses a blank name and stores nothing', async () => {
      const output = await runTool('create_invite', { display_name: '   ', role: 'member' });

      expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: display_name"}');
      expect(await database.query('SELECT 1 FROM workspace_invites')).toEqual([]);
    });

    it('refuses a member', async () => {
      const hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });

      const output = await runTool('create_invite', { display_name: 'Lan', role: 'member' }, { workspaceId, userId: hungUserId, role: 'member' });

      expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
      expect(await database.query('SELECT 1 FROM workspace_invites')).toEqual([]);
    });
  });

  describe('removing a member', () => {
    async function findMembershipId(displayName: string): Promise<string> {
      const [row] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE display_name = '${displayName}'`);
      if (!row) throw new Error(`no member named ${displayName}`);
      return row.id;
    }

    it('deletes the membership of the person', async () => {
      await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });

      const output = await runTool('remove_member', { member_id: await findMembershipId('Hùng') });

      expect(output).toBe('{"ok":true,"removed":"Hùng"}');
      expect(await database.query('SELECT display_name FROM memberships')).toEqual([{ display_name: 'Duy' }]);
    });

    it('keeps the records of the removed person visible to admins', async () => {
      const hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
      await runTool('remove_member', { member_id: await findMembershipId('Hùng') });

      const output = await runTool('search_records', {
        text: null, category: null, member: 'Hùng', plate: null, added_from: null, added_to: null, cursor: null,
      });

      expect((JSON.parse(output) as { items: unknown[] }).items).toHaveLength(2);
    });

    it('refuses to remove the caller', async () => {
      const output = await runTool('remove_member', { member_id: await findMembershipId('Duy') });

      expect(output).toBe('{"ok":false,"error":"Không thể tự xóa chính mình."}');
      expect(await database.query('SELECT display_name FROM memberships')).toEqual([{ display_name: 'Duy' }]);
    });
  });
});
