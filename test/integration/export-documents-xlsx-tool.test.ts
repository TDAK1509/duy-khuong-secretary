import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { ADMIN_TOOLS } from '../../src/app/admin-chat/tools/admin-tools.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakeFileStorage } from '../fakes/fake-file-storage.ts';
import { insertNumberedDocument } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type ExportOutput = {
  ok: boolean;
  url?: string;
  filename?: string;
  count?: number;
  described_filter?: string;
  expires_hours?: number;
  reason?: string;
};

describe('export_documents_xlsx tool', () => {
  const clock = new FakeClock(new Date('2026-11-15T10:00:00+07:00'));
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let memberId: string;
  let duy: AccessScope;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    memberId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('stores the xlsx file in R2 under the workspace-scoped key', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0001' });
    const storage = new FakeFileStorage();

    const result = await runExport({}, storage);

    expect(result.ok).toBe(true);
    const puts = storage.listPuts();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toMatch(new RegExp(`^exports/workspace_${workspaceId}/`));
    expect(puts[0]!.key).toMatch(/\.xlsx$/);
    expect(puts[0]!.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('stores the xlsx file under the exports/ prefix', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0001b' });
    const storage = new FakeFileStorage();

    const result = await runExport({}, storage);

    expect(result.ok).toBe(true);
    const puts = storage.listPuts();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toMatch(new RegExp(`^exports/workspace_${workspaceId}/`));
    expect(puts[0]!.key).toMatch(/\.xlsx$/);
  });

  it('never writes under the old workspace_<id>/exports/ prefix', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0001c' });
    const storage = new FakeFileStorage();

    await runExport({}, storage);

    const oldPrefixPattern = /^workspace_[^/]+\/exports\//;
    expect(storage.listPuts().every((put) => !oldPrefixPattern.test(put.key))).toBe(true);
  });

  it('returns a presigned URL and 24-hour expiry', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0002' });
    const storage = new FakeFileStorage();
    storage.stubDefaultUrl('https://r2.example.com/file.xlsx?X-Amz-Expires=86400');

    const result = await runExport({}, storage);

    expect(result.ok).toBe(true);
    expect(result.url).toBe('https://r2.example.com/file.xlsx?X-Amz-Expires=86400');
    expect(result.expires_hours).toBe(24);
  });

  it('filters documents by date range and reports the correct count', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0003', documentDate: '2026-11-14' });
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0004', documentDate: '2026-11-01' });
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0005', documentDate: '2026-10-10' });
    const storage = new FakeFileStorage();

    const result = await runExport({ date_from: '2026-11-01', date_to: '2026-11-30' }, storage);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    const workbook = await readWorkbookFromStorage(storage);
    expect(workbook.getWorksheet('Giấy tờ')?.rowCount).toBe(3);
  });

  it('filters documents by vehicle plate', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0006', vehiclePlate: '93C12346' });
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0007', vehiclePlate: '93C12346' });
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0008', vehiclePlate: '93C12344' });
    const storage = new FakeFileStorage();

    const result = await runExport({ plate: '93C12346' }, storage);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    const workbook = await readWorkbookFromStorage(storage);
    expect(workbook.getWorksheet('Giấy tờ')?.rowCount).toBe(3);
  });

  it('returns no_matches and writes no file when there are zero matching documents', async () => {
    const storage = new FakeFileStorage();

    const result = await runExport({ date_from: '2020-02-01', date_to: '2020-02-29' }, storage);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_matches');
    expect(storage.listPuts()).toHaveLength(0);
  });

  it('never includes documents from another workspace', async () => {
    await insertNumberedDocument(database, { workspaceId, userId: memberId, documentNumber: '0009' });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const otherMemberId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy' });
    await insertNumberedDocument(database, { workspaceId: otherWorkspaceId, userId: otherMemberId, documentNumber: '0010' });
    const storage = new FakeFileStorage();

    const result = await runExport({}, storage);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it('includes export_documents_xlsx in the admin tool list', () => {
    const names = ADMIN_TOOLS.map((t) => t.name);

    expect(names).toContain('export_documents_xlsx');
  });

  async function runExport(overrides: Record<string, string | null>, storage: FakeFileStorage): Promise<ExportOutput> {
    const args = buildFilterArguments(overrides);
    const output = await runTool('export_documents_xlsx', args, duy, storage);
    return JSON.parse(output) as ExportOutput;
  }

  function buildFilterArguments(overrides: Record<string, string | null>): Record<string, string | null> {
    return {
      organization: null,
      role: null,
      stage: null,
      kind: null,
      plate: null,
      date_meaning: null,
      date_from: null,
      date_to: null,
      ...overrides,
    };
  }

  async function runTool(name: string, args: object, scope: AccessScope, storage: FakeFileStorage): Promise<string> {
    const dependencies = {
      database: pool,
      clock,
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      guard: new AdminTextGuard(false),
      fileStorage: storage,
    };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});

async function readWorkbookFromStorage(storage: FakeFileStorage): Promise<ExcelJS.Workbook> {
  const puts = storage.listPuts();
  const lastPut = puts[puts.length - 1];
  if (!lastPut) throw new Error('no file was stored');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(lastPut.bytes.buffer as ArrayBuffer);
  return workbook;
}
