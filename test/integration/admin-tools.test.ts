import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';

type SearchFilters = Partial<Record<'text' | 'category' | 'member' | 'plate' | 'added_from' | 'added_to' | 'cursor', string>>;

type SearchResult = { items: { id: string; member: string; plate: string | null; category: string; document_title: string | null; has_photo: boolean }[]; next_cursor: string | null };

describe('the data tools of an admin', () => {
  const clock = new FakeClock(new Date('2026-11-02T10:00:00+07:00'));
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;
  let lanUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  async function runSearch(filters: SearchFilters = {}, scope: AccessScope = duy): Promise<SearchResult> {
    const args = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null, ...filters };
    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, scope, { id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(args) });
    return JSON.parse(output) as SearchResult;
  }

  it('returns every sender\'s records of the workspace to an admin', async () => {
    for (const [userId, senderName] of [[hungUserId, 'Hùng'], [lanUserId, 'Lan']] as const) {
      await insertRecordRow(database, { workspaceId, userId, senderName });
      await insertRecordRow(database, { workspaceId, userId, senderName });
    }

    const result = await runSearch();

    expect(result.items).toHaveLength(4);
  });

  it('never returns another workspace\'s records', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan' });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    for (let count = 0; count < 3; count += 1) {
      await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy', identifiers: ['DT2024889'] });
    }

    const result = await runSearch({ text: 'DT2024-889' });

    expect(result.items).toEqual([]);
  });

  it('narrows to one person by name, ignoring accents', async () => {
    for (const [userId, senderName] of [[hungUserId, 'Hùng'], [lanUserId, 'Lan']] as const) {
      await insertRecordRow(database, { workspaceId, userId, senderName });
      await insertRecordRow(database, { workspaceId, userId, senderName });
    }

    const result = await runSearch({ member: 'hung' });

    expect(result.items.map((item) => item.member)).toEqual(['Hùng', 'Hùng']);
  });

  it('narrows to one truck by plate', async () => {
    for (const vehiclePlate of ['29C12345', '29C12345', '51D67890', '51D67890', '51D67890']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', vehiclePlate });
    }

    const result = await runSearch({ plate: '29c-123.45' });

    expect(result.items.map((item) => item.plate)).toEqual(['29C12345', '29C12345']);
  });

  it('narrows to one category', async () => {
    for (const category of ['đổ xăng dầu', 'đổ xăng dầu', 'phí cầu đường']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category });
    }

    const result = await runSearch({ category: 'phí cầu đường' });

    expect(result.items.map((item) => item.category)).toEqual(['phí cầu đường']);
  });

  it('narrows to a category that is not in the old list, ignoring accents and case', async () => {
    for (const category of ['kiểm định xe', 'phiếu cân']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category });
    }

    const result = await runSearch({ category: 'Kiem Dinh XE' });

    expect(result.items.map((item) => item.category)).toEqual(['kiểm định xe']);
  });

  it('returns the printed title of a record', async () => {
    const documentTitle = 'Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới';
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'kiểm định xe', documentTitle });

    const result = await runSearch();

    expect(result.items.map((item) => item.document_title)).toEqual([documentTitle]);
  });

  it('ignores Vietnamese accents in the text', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }],
    });

    const result = await runSearch({ text: 'long bien' });

    expect(result.items).toHaveLength(1);
  });

  it('finds text stored with repeated spaces', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [{ label: 'Tên trạm', value: 'Long   Biên' }],
    });

    const result = await runSearch({ text: 'long bien' });

    expect(result.items).toHaveLength(1);
  });

  it('matches the letter đ typed as d', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      details: [{ label: 'Tuyến', value: 'Đường cao tốc Pháp Vân' }],
    });

    const result = await runSearch({ text: 'duong' });

    expect(result.items).toHaveLength(1);
  });

  it('matches an identifier typed with punctuation', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', identifiers: ['DT2024889'] });

    const result = await runSearch({ text: 'dt2024-889' });

    expect(result.items).toHaveLength(1);
  });

  it('matches document numbers', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', documentNumber: '0001234' });

    const result = await runSearch({ text: '0001234' });

    expect(result.items).toHaveLength(1);
  });

  it('counts the date range in Vietnam time', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: hungUserId,
      senderName: 'Hùng',
      createdAt: new Date('2026-10-30T23:30:00+07:00'),
    });

    const result = await runSearch({ added_from: '2026-10-31' });

    expect(result.items).toEqual([]);
  });

  it('refuses an invalid date', async () => {
    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: null, category: null, member: null, plate: null, added_from: '2026-02-30', added_to: null, cursor: null }),
    });

    expect(output).toBe('{"ok":false,"error":"Ngày không hợp lệ."}');
  });

  describe('with 60 records', () => {
    let recordIds: string[];

    beforeEach(async () => {
      recordIds = [];
      for (let number = 0; number < 60; number += 1) {
        const createdAt = new Date(Date.UTC(2026, 9, 31, 0, 0, number));
        recordIds.push(await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', createdAt }));
      }
    });

    it('holds 50 items and a cursor on the first page, newest first', async () => {
      const result = await runSearch();

      expect(result.items.map((item) => item.id)).toEqual(recordIds.slice(10).reverse());
      expect(result.next_cursor).not.toBeNull();
    });

    it('returns the rest from the cursor', async () => {
      const first = await runSearch();

      const second = await runSearch({ cursor: first.next_cursor ?? '' });

      expect(second.items.map((item) => item.id)).toEqual(recordIds.slice(0, 10).reverse());
      expect(second.next_cursor).toBeNull();
    });
  });

  it('never skips or repeats a row across pages when times are equal', async () => {
    const sameTime = new Date('2026-10-31T10:00:00+07:00');
    for (let number = 0; number < 60; number += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', createdAt: sameTime });
    }

    const first = await runSearch();
    const second = await runSearch({ cursor: first.next_cursor ?? '' });

    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(60);
  });

  it('shows only the caller\'s workspace for a cursor from another workspace', async () => {
    for (let number = 0; number < 3; number += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    }
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    const otherRecordId = await insertRecordRow(database, {
      workspaceId: otherWorkspaceId,
      userId: vyUserId,
      senderName: 'Vy',
      createdAt: new Date('2026-10-31T12:00:00+07:00'),
    });
    const [{ created_at_utc: createdAtUtc } = { created_at_utc: '' }] = await database.query<{ created_at_utc: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc FROM records WHERE id = '${otherRecordId}'`,
    );
    const cursor = Buffer.from(`${createdAtUtc}|${otherRecordId}`).toString('base64url');

    const result = await runSearch({ cursor });

    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.member === 'Hùng')).toBe(true);
  });

  it('refuses an unreadable cursor', async () => {
    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: 'xyz' }),
    });

    expect(output).toBe('{"ok":false,"error":"Con trỏ không hợp lệ."}');
  });

  it('blocks the next page when the admin lost access', async () => {
    for (let number = 0; number < 60; number += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    }
    const first = await runSearch();
    await database.query(`DELETE FROM memberships WHERE display_name = 'Duy'`);

    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: first.next_cursor }),
    });

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
  });

  it('keeps the records of a removed sender visible under the saved name', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    await database.query(`DELETE FROM memberships WHERE display_name = 'Hùng'`);

    const result = await runSearch({ member: 'Hùng' });

    expect(result.items.map((item) => item.member)).toEqual(['Hùng', 'Hùng']);
  });

  it('carries the record id and the photo flag in a result', async () => {
    const recordId = await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', hasPhoto: true });

    const result = await runSearch();

    expect(result.items).toMatchObject([{ id: recordId, has_photo: true }]);
  });

  describe('counting', () => {
    type CountResult = {
      members: { member: string; total_count: number; by_category: { category: string; count: number; amount_vnd: number }[] }[];
    };

    async function runCount(scope: AccessScope = duy, range = { added_from: '2026-10-31', added_to: '2026-10-31' }): Promise<CountResult> {
      const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, scope, { id: 'call_1', name: 'count_records', argumentsJson: JSON.stringify(range) });
      return JSON.parse(output) as CountResult;
    }

    it('refuses a range whose end is not a real date', async () => {
      const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
        id: 'call_1',
        name: 'count_records',
        argumentsJson: JSON.stringify({ added_from: '2026-10-31', added_to: '2026-02-30' }),
      });

      expect(output).toBe('{"ok":false,"error":"Ngày không hợp lệ."}');
    });

    it('lists every current person, including those with nothing', async () => {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });

      const result = await runCount();

      expect(result.members.map((row) => [row.member, row.total_count])).toEqual([['Duy', 0], ['Hùng', 2], ['Lan', 0]]);
    });

    it('includes a former member who has records in the range', async () => {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
      await database.query(`DELETE FROM memberships WHERE display_name = 'Hùng'`);

      const result = await runCount();

      expect(result.members.find((row) => row.member === 'Hùng')?.total_count).toBe(2);
    });

    it('sums the amounts per category', async () => {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'đổ xăng dầu', amountVnd: 1000000 });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'đổ xăng dầu', amountVnd: 1500000 });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category: 'phí cầu đường', amountVnd: 35000 });

      const result = await runCount();

      expect(result.members.find((row) => row.member === 'Hùng')?.by_category).toEqual([
        { category: 'đổ xăng dầu', count: 2, amount_vnd: 2500000 },
        { category: 'phí cầu đường', count: 1, amount_vnd: 35000 },
      ]);
    });

    it('never includes another workspace', async () => {
      const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
      const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
      for (let number = 0; number < 5; number += 1) {
        await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy' });
      }

      const result = await runCount();

      expect(result.members.every((row) => row.total_count === 0)).toBe(true);
      expect(result.members.map((row) => row.member)).not.toContain('Vy');
    });

    it('combines the records of one person who saved under two names', async () => {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', amountVnd: 1000000 });
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng Nguyễn', amountVnd: 500000 });

      const result = await runCount();

      expect(result.members.filter((row) => row.member === 'Hùng')).toEqual([
        { member: 'Hùng', total_count: 2, by_category: [{ category: 'đổ xăng dầu', count: 2, amount_vnd: 1500000 }] },
      ]);
      expect(result.members).toHaveLength(3);
    });
  });

  describe('listing members', () => {
    type MembersResult = { members: { id: string; name: string; role: string; joined_on: string }[] };

    async function runListMembers(scope: AccessScope = duy): Promise<MembersResult> {
      return JSON.parse(await runListMembersOutput(scope)) as MembersResult;
    }

    async function runListMembersOutput(scope: AccessScope = duy): Promise<string> {
      return runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, scope, { id: 'call_1', name: 'list_members', argumentsJson: '{}' });
    }

    it('lists only the caller\'s workspace', async () => {
      const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
      for (const [externalUserId, displayName] of [['zu-vy', 'Vy'], ['zu-a', 'An'], ['zu-b', 'Bình']] as const) {
        await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId, displayName });
      }

      const result = await runListMembers();

      expect(result.members.map((member) => [member.name, member.role])).toEqual([
        ['Duy', 'quản lý'],
        ['Hùng', 'thành viên'],
        ['Lan', 'thành viên'],
      ]);
      expect(result.members.every((member) => member.id !== '')).toBe(true);
    });

    it('shows each person\'s join date and no Zalo name', async () => {
      await database.query(`UPDATE channel_identities SET zalo_name = 'Hung Nguyen' WHERE external_user_id = 'zu-hung'`);
      await database.query(`UPDATE memberships SET created_at = '2026-11-01 09:00 +07' WHERE user_id = '${hungUserId}'`);
      const [hung] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${hungUserId}'`);

      const output = await runListMembersOutput();

      expect((JSON.parse(output) as MembersResult).members.find((member) => member.name === 'Hùng')).toEqual({
        id: hung?.id,
        name: 'Hùng',
        role: 'thành viên',
        joined_on: '01/11/2026',
      });
      expect(output).not.toContain('Hung Nguyen');
    });
  });

  it('refuses a tool called with a member\'s scope', async () => {
    const memberScope: AccessScope = { workspaceId, userId: hungUserId, role: 'member' };

    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, memberScope, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null }),
    });

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
  });

  it('names the argument that has the wrong type', async () => {
    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: 5, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null }),
    });

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: text"}');
  });

  it('refuses a category that is not text', async () => {
    const output = await runAdminTool({ database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) }, duy, {
      id: 'call_1',
      name: 'search_records',
      argumentsJson: JSON.stringify({ text: null, category: 5, member: null, plate: null, added_from: null, added_to: null, cursor: null }),
    });

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: category"}');
  });

  async function runCall(name: string, argumentsJson: string): Promise<string> {
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, duy, { id: 'call_1', name, argumentsJson });
  }

  it('refuses a tool name it does not know', async () => {
    const output = await runCall('delete_everything', '{}');

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: name"}');
  });

  it('refuses arguments that are not valid JSON', async () => {
    const output = await runCall('search_records', '{"text":');

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: arguments"}');
  });

  it('refuses arguments that are not an object', async () => {
    const output = await runCall('search_records', 'null');

    expect(output).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: arguments"}');
  });

  it('lets an unexpected error of a tool reach the caller', async () => {
    const connectionLost = new Error('connection lost');
    const database = { query: pool.query.bind(pool), connect: () => Promise.reject(connectionLost) };
    const dependencies = { database, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard: new AdminTextGuard(false) };

    const running = runAdminTool(dependencies, duy, { id: 'call_1', name: 'list_members', argumentsJson: '{}' });

    await expect(running).rejects.toBe(connectionLost);
  });

  it('refuses a change after a search and writes nothing', async () => {
    const guard = new AdminTextGuard(false);
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), guard };
    const searchArguments = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };
    await runAdminTool(dependencies, duy, { id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(searchArguments) });
    const [hung] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${hungUserId}'`);

    const output = await runAdminTool(dependencies, duy, {
      id: 'call_2',
      name: 'remove_member',
      argumentsJson: JSON.stringify({ member_id: hung?.id }),
    });

    expect(output).toBe(
      '{"ok":false,"error":"Chưa làm: tin nhắn có ảnh hoặc lượt này đã đọc dữ liệu do thành viên gửi. Không gọi lại. Hệ thống tự hướng dẫn quản lý."}',
    );
    expect(await database.query(`SELECT 1 FROM memberships WHERE user_id = '${hungUserId}'`)).toHaveLength(1);
  });
});
