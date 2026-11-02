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
});
