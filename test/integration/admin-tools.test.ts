import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type SearchFilters = Partial<Record<'text' | 'category' | 'member' | 'plate' | 'added_from' | 'added_to' | 'cursor', string>>;

type SearchResult = { items: { id: string; member: string; has_photo: boolean }[]; next_cursor: string | null };

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
});
