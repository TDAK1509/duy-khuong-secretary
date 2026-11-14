import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { lockWorkspaceMembers } from '../../src/app/workspaces/lock-workspace-members.ts';
import { storeConnection } from '../../src/app/channel-auth/store-connection.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { makeTokenPair } from '../fakes/fake-channel-auth.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';

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
    return runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), sources: new SourceCards(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(false) }, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
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

    it('includes a plate name hint when the display name looks like a plate', async () => {
      const output = await runTool('create_invite', { display_name: 'Tài xế 93C12346', role: 'member' });

      const result = JSON.parse(output) as { name_hint: string };
      expect(result.name_hint).toContain('Tên "Tài xế 93C12346" trông giống biển số xe');
      expect(result.name_hint).toContain('Lưu cho Tài xế 93C12346: Biển số xe: 93C12346');
    });

    it('includes a person name hint with an example plate when the display name is a person', async () => {
      const output = await runTool('create_invite', { display_name: 'Tài xế Toàn', role: 'member' });

      const result = JSON.parse(output) as { name_hint: string };
      expect(result.name_hint).toContain('Ví dụ: "Lưu cho Tài xế Toàn: Biển số xe: 93A-1234"');
    });

    it('stores the display name unchanged when the name looks like a plate', async () => {
      await runTool('create_invite', { display_name: 'Tài xế 93C12346', role: 'member' });

      const rows = await database.query<{ display_name: string }>('SELECT display_name FROM workspace_invites');
      expect(rows).toEqual([{ display_name: 'Tài xế 93C12346' }]);
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

    it('does not find a membership of another workspace', async () => {
      const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
      await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });

      const output = await runTool('remove_member', { member_id: await findMembershipId('Vy') });

      expect(output).toBe('{"ok":false,"error":"Không tìm thấy người này."}');
      expect(await database.query('SELECT display_name FROM memberships WHERE display_name = \'Vy\'')).toHaveLength(1);
    });

    it('does not find an id that is not a uuid', async () => {
      const output = await runTool('remove_member', { member_id: 'abc' });

      expect(output).toBe('{"ok":false,"error":"Không tìm thấy người này."}');
    });

    it('lets only one of two admins remove each other at the same moment', async () => {
      const khuongUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-khuong', displayName: 'Khương', role: 'admin' });
      const khuong: AccessScope = { workspaceId, userId: khuongUserId, role: 'admin' };
      const duyMembershipId = await findMembershipId('Duy');
      const khuongMembershipId = await findMembershipId('Khương');
      const { holdLock, releaseLock } = await holdMemberLock();

      const duyRemovesKhuong = runTool('remove_member', { member_id: khuongMembershipId }, duy);
      const khuongRemovesDuy = runTool('remove_member', { member_id: duyMembershipId }, khuong);
      try {
        await vi.waitFor(async () => expect(await countWaitingForLock()).toBe(2));
      } finally {
        releaseLock();
        await holdLock;
      }

      const outputs = await Promise.all([duyRemovesKhuong, khuongRemovesDuy]);
      expect(outputs.filter((output) => output.startsWith('{"ok":true'))).toHaveLength(1);
      expect(outputs.filter((output) => output === '{"ok":false,"error":"Không có quyền."}')).toHaveLength(1);
      expect(await database.query(`SELECT 1 FROM memberships WHERE role = 'admin'`)).toHaveLength(1);
    });

    async function holdMemberLock(): Promise<{ holdLock: Promise<void>; releaseLock: () => void }> {
      let releaseLock = (): void => {};
      const released = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      let markHeld = (): void => {};
      const isHeld = new Promise<void>((resolve) => {
        markHeld = resolve;
      });
      const holdLock = runInTransaction(pool, async (transaction) => {
        await lockWorkspaceMembers(transaction, workspaceId);
        markHeld();
        await released;
      });
      await isHeld;
      return { holdLock, releaseLock };
    }

    async function countWaitingForLock(): Promise<number> {
      const rows = await database.query<{ waiting: string }>(
        `SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
      );
      return Number(rows[0]?.waiting);
    }
  });
});
