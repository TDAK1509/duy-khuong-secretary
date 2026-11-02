import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type SearchFilters = Partial<Record<'text' | 'category' | 'member' | 'plate' | 'added_from' | 'added_to' | 'cursor', string>>;

type SearchResult = { items: { id: string; member: string; plate: string | null; category: string; has_photo: boolean }[]; next_cursor: string | null };

describe('the data tools of an admin', () => {
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
    const output = await runAdminTool(pool, scope, { id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(args) });
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
    for (const category of ['fuel', 'fuel', 'toll']) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', category });
    }

    const result = await runSearch({ category: 'toll' });

    expect(result.items.map((item) => item.category)).toEqual(['toll']);
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
    const output = await runAdminTool(pool, duy, {
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
    const output = await runAdminTool(pool, duy, {
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

    const output = await runAdminTool(pool, duy, {
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
      const output = await runAdminTool(pool, scope, { id: 'call_1', name: 'count_records', argumentsJson: JSON.stringify(range) });
      return JSON.parse(output) as CountResult;
    }

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
  });
});
