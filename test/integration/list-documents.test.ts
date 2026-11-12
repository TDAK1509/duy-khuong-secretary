import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertAnotherSource, insertNumberedDocument, insertNumberLine } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type ListedDocument = {
  id: string;
  numbers: { line_no: number; item: string | null; label: string; value: string; number: string; unit: string }[];
};

type ListOutput = { ok: boolean; documents: ListedDocument[]; next_cursor: string | null };

describe('the document list of an admin', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('lists a document once however many photos show it', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0001' });
    await insertAnotherSource(database, { workspaceId, userId: hungUserId, documentId });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });

    const listed = await runList();

    expect(listed.documents.map((document) => document.id)).toEqual([documentId]);
  });

  it('lists only the document-level numbers when the lines are document', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0002' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 1, meaning: 'khối lượng', number: 500, unit: 'kg', item: 'Giấy cuộn' });

    const listed = await runList({ lines: 'document' });

    expect(listed.documents[0]?.numbers).toEqual([{ line_no: 0, item: null, label: 'khối lượng', value: '26380 kg', number: '26380', unit: 'kg' }]);
  });

  it('lists only the item-level numbers when the lines are item', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0003' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 1, meaning: 'khối lượng', number: 500, unit: 'kg', item: 'Giấy cuộn' });

    const listed = await runList({ lines: 'item' });

    expect(listed.documents[0]?.numbers).toEqual([{ line_no: 1, item: 'Giấy cuộn', label: 'khối lượng', value: '500 kg', number: '500', unit: 'kg' }]);
  });

  async function runList(overrides: Record<string, string | null> = {}, scope: AccessScope = duy): Promise<ListOutput> {
    const args = { meaning: 'khối lượng', lines: 'document', ...buildEmptyFilters(), cursor: null, ...overrides };
    return JSON.parse(await runTool('list_documents', args, scope)) as ListOutput;
  }

  function buildEmptyFilters(): Record<string, null> {
    return { organization: null, role: null, stage: null, kind: null, plate: null, date_meaning: null, date_from: null, date_to: null };
  }

  async function runTool(name: string, args: object, scope: AccessScope): Promise<string> {
    const clock = new FakeClock(new Date('2026-11-07T10:00:00+07:00'));
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), sources: new SourceCards(), created: new CreatedTasks(null), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
