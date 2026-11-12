import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool, runToolInScope } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import type { AdminToolDependencies } from '../../src/app/admin-chat/tools/tool-dependencies.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { insertAnotherSource, insertNumberedDocument, insertNumberLine, insertParty } from './document-number-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type ListedDocument = {
  id: string;
  numbers: { line_no: number; item: string | null; label: string; value: string; number: string; unit: string }[];
};

type TotalOutput = { groups: { unit: string; count: number; sum: string; min: string; max: string }[] };

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

  it('leaves out a document that waits for review', async () => {
    const accepted = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0004' });
    const waiting = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0005', status: 'needs_review' });
    await insertNumberLine(database, { workspaceId, documentId: accepted, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });
    await insertNumberLine(database, { workspaceId, documentId: waiting, lineNo: 0, meaning: 'khối lượng', number: 27790, unit: 'kg' });

    const listed = await runList();

    expect(listed.documents.map((document) => document.id)).toEqual([accepted]);
  });

  it('lists numbers that add up to the total of the same filters', async () => {
    const chengLoongId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty Cheng Loong' });
    const hoaPhatId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty Hòa Phát' });
    const weighings = [
      { organizationId: chengLoongId, kg: 26380, unit: 'kg' },
      { organizationId: chengLoongId, kg: 27790, unit: 'kg' },
      { organizationId: hoaPhatId, kg: 1250, unit: 'kg' },
      { organizationId: hoaPhatId, kg: 30010, unit: 'kg' },
      { organizationId: hoaPhatId, kg: 990, unit: 'kg' },
      { organizationId: chengLoongId, kg: 12, unit: 'tấn' },
    ];
    for (const [index, weighing] of weighings.entries()) {
      const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: `10${index}` });
      await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: weighing.kg, unit: weighing.unit });
      await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId: weighing.organizationId, printedName: 'Khách' });
    }

    const listed = await runList();
    const total = JSON.parse(await runTool('total_document_numbers', { meaning: 'khối lượng', lines: 'document', ...buildEmptyFilters(), group_by: 'none' }, duy)) as TotalOutput;

    expect(summarizeByUnit(listed.documents)).toEqual(total.groups.map(({ unit, count, sum, min, max }) => ({ unit, count, sum, min, max })));
  });

  function summarizeByUnit(documents: ListedDocument[]): TotalOutput['groups'] {
    const numbers = documents.flatMap((document) => document.numbers);
    const units = [...new Set(numbers.map((listed) => listed.unit))].sort();
    return units.map((unit) => {
      const values = numbers.filter((listed) => listed.unit === unit).map((listed) => Number(listed.number));
      return { unit, count: values.length, sum: String(values.reduce((sum, value) => sum + value, 0)), min: String(Math.min(...values)), max: String(Math.max(...values)) };
    });
  }

  it('splits twenty-one documents created at the same instant into two pages without repeats', async () => {
    for (let index = 0; index < 21; index++) {
      const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: `20${index}` });
      await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 1000 + index, unit: 'kg' });
    }
    await database.query(`UPDATE documents SET created_at = '2026-11-05T10:00:00.123456Z'`);

    const firstPage = await runList();
    const secondPage = await runList({ cursor: firstPage.next_cursor });

    const ids = [...firstPage.documents, ...secondPage.documents].map((document) => document.id);
    expect([firstPage.documents.length, secondPage.documents.length, new Set(ids).size, secondPage.next_cursor]).toEqual([20, 1, 21, null]);
  });

  it('leaves out a document of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Nhóm khác');
    const otherUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-other', displayName: 'Khác' });
    const documentId = await insertNumberedDocument(database, { workspaceId: otherWorkspaceId, userId: otherUserId, documentNumber: '0030' });
    await insertNumberLine(database, { workspaceId: otherWorkspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });

    const listed = await runList();

    expect(listed.documents).toEqual([]);
  });

  it('refuses a member who dispatches list_documents', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0031' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'khối lượng', number: 26380, unit: 'kg' });
    const hung: AccessScope = { workspaceId, userId: hungUserId, role: 'member' };
    const args = { meaning: 'khối lượng', lines: 'document', ...buildEmptyFilters(), cursor: null };

    const output = await runToolInScope(buildDependencies(), hung, { id: 'call_1', name: 'list_documents', argumentsJson: JSON.stringify(args) });

    expect(JSON.parse(output)).toEqual({ ok: false, error: 'Không có quyền.' });
  });

  async function runList(overrides: Record<string, string | null> = {}, scope: AccessScope = duy): Promise<ListOutput> {
    const args = { meaning: 'khối lượng', lines: 'document', ...buildEmptyFilters(), cursor: null, ...overrides };
    return JSON.parse(await runTool('list_documents', args, scope)) as ListOutput;
  }

  function buildEmptyFilters(): Record<string, null> {
    return { organization: null, role: null, stage: null, kind: null, plate: null, date_meaning: null, date_from: null, date_to: null };
  }

  async function runTool(name: string, args: object, scope: AccessScope): Promise<string> {
    return runAdminTool(buildDependencies(), scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  function buildDependencies(): AdminToolDependencies {
    const clock = new FakeClock(new Date('2026-11-07T10:00:00+07:00'));
    return { database: pool, clock, attachments: new PhotoAttachments(), sources: new SourceCards(), created: new CreatedTasks(null), invites: new CreatedInvites(), guard: new AdminTextGuard(false) };
  }
});
