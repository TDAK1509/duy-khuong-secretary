import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { buildMatchKey } from '../../src/app/documents/build-match-key.ts';
import { formatVietnamDate } from '../../src/app/time/format-vietnam-date.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { insertNumberedDocument, insertParty } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { literal } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const CHENG_LOONG = 'Cheng Loong';
const CHONG_LOONG = 'Công ty TNHH Chống Loong Bình Dương Paper';

type MergedNamesOutput = {
  ok: boolean;
  merged_names: { printed_name: string; organization: string; merged_on: string; document_count: number }[];
  left_out: number;
};

describe('the merged names of an admin', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;
  let chengLoongId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId, name: CHENG_LOONG });
    await insertMergedName({ printedName: CHONG_LOONG, documentCount: 2 });
    await insertDocumentOf(CHENG_LOONG, '0003');
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('lists a merge with its company, date and paper count', async () => {
    const listed = await runListMergedNames();

    expect(listed.merged_names).toEqual([
      { printed_name: CHONG_LOONG, organization: CHENG_LOONG, merged_on: formatVietnamDate(new Date()), document_count: 2 },
    ]);
    expect(listed.left_out).toBe(0);
  });

  it('lists the newest merge first', async () => {
    await insertMergedName({ printedName: 'Kim Nhân Đạo cũ', documentCount: 0, createdAt: '2000-01-01T10:00:00+07:00' });
    await insertMergedName({ printedName: 'Kim Nhân Đạo mới', documentCount: 0, createdAt: '2100-01-01T10:00:00+07:00' });

    const listed = await runListMergedNames();

    expect(listed.merged_names.map((merged) => merged.printed_name)).toEqual(['Kim Nhân Đạo mới', CHONG_LOONG, 'Kim Nhân Đạo cũ']);
  });

  it('filters the list by text without accents or case', async () => {
    await insertMergedName({ printedName: 'Kim Nhân Đạo', documentCount: 0 });

    const listed = await runListMergedNames('chong loong');

    expect(listed.merged_names.map((merged) => merged.printed_name)).toEqual([CHONG_LOONG]);
  });

  it('stops the list at 50 names and counts the rest as left out', async () => {
    for (let index = 0; index < 50; index++) await insertMergedName({ printedName: `Kim Nhân Đạo ${index}`, documentCount: 0 });

    const listed = await runListMergedNames();

    expect(listed.merged_names).toHaveLength(50);
    expect(listed.left_out).toBe(1);
  });

  it('lists no merge of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const otherOrganizationId = await insertOrganizationWithAlias(database, { workspaceId: otherWorkspaceId, name: 'Kim Nhân Đạo' });
    await database.query(
      `INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key)
       VALUES (${literal(otherWorkspaceId)}, ${literal(otherOrganizationId)}, 'KNĐ', 'knd')`,
    );
    await database.query(
      `INSERT INTO merged_names (workspace_id, organization_id, printed_name, match_key)
       VALUES (${literal(otherWorkspaceId)}, ${literal(otherOrganizationId)}, 'KNĐ', 'knd')`,
    );

    const listed = await runListMergedNames('knd');

    expect(listed.merged_names).toEqual([]);
  });

  async function insertMergedName(row: { printedName: string; documentCount: number; createdAt?: string }): Promise<void> {
    const matchKey = buildMatchKey(row.printedName);
    await database.query(
      `INSERT INTO organization_aliases (workspace_id, organization_id, printed_name, match_key)
       VALUES (${literal(workspaceId)}, ${literal(chengLoongId)}, ${literal(row.printedName)}, ${literal(matchKey)})`,
    );
    await database.query(
      `INSERT INTO merged_names (workspace_id, organization_id, printed_name, match_key, created_at)
       VALUES (${literal(workspaceId)}, ${literal(chengLoongId)}, ${literal(row.printedName)}, ${literal(matchKey)}, ${row.createdAt ? literal(row.createdAt) : 'now()'})`,
    );
    for (let index = 0; index < row.documentCount; index++) await insertDocumentOf(row.printedName, `${matchKey.slice(0, 8)}${index}`);
  }

  async function insertDocumentOf(printedName: string, documentNumber: string): Promise<void> {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber });
    await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId: chengLoongId, printedName });
  }

  async function runListMergedNames(text: string | null = null, scope: AccessScope = duy): Promise<MergedNamesOutput> {
    return JSON.parse(await runTool('list_merged_names', { text }, scope)) as MergedNamesOutput;
  }

  async function runTool(name: string, args: object, scope: AccessScope): Promise<string> {
    const dependencies = {
      database: pool,
      clock: new FakeClock(new Date('2026-11-12T10:00:00+07:00')),
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      guard: new AdminTextGuard(false),
    };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
