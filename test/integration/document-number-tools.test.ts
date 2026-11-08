import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runAdminTool } from '../../src/app/admin-chat/tools/run-admin-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertOrganizationWithAlias } from './document-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import { INVALID_DATE_ERROR } from '../../src/app/admin-chat/tools/tool-result.ts';
import { insertAlias, insertAnotherSource, insertDateLine, insertNumberedDocument, insertNumberLine, insertParty, insertReadOfMessage, insertSourceOfMessage } from './document-number-rows.ts';
import { insertChatMessage } from './message-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type TotalArguments = Record<string, string | null>;

type TotalOutput = {
  ok: boolean;
  pending_name_documents: number;
  review_documents: number;
  without_number: number;
  not_reread_messages: number;
  groups: { group: string | null; unit: string; count: number; sum: string; min: string; max: string }[];
};

type ListOutput = {
  ok: boolean;
  numbers: { meaning: string; value_type: string; unit: string | null; document_count: number; item_document_count: number }[];
};

type OrganizationsOutput = {
  ok: boolean;
  organizations: { name: string; type: string; aliases: string[]; document_count: number }[];
};

describe('the document number tools of an admin', () => {
  const clock = new FakeClock(new Date('2026-11-07T10:00:00+07:00'));
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
    chengLoongId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty TNHH Cheng Loong Bình Dương Paper' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('counts a document once however many photos show it', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0001' });
    await insertAnotherSource(database, { workspaceId, userId: hungUserId, documentId });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: 26380, unit: 'kg' });
    await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId: chengLoongId, printedName: 'Cheng Loong' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('counts a document once when the same company appears in two roles', async () => {
    const documentId = await insertWeighing({ documentNumber: '0002', netKg: 26380 });
    await insertParty(database, { workspaceId, documentId, role: 'issuer', organizationId: chengLoongId, printedName: 'Cheng Loong' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper', role: null });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('leaves out the port ticket of the same load when the stage is receipt', async () => {
    await insertWeighing({ documentNumber: '0003', netKg: 26380, stage: 'receipt' });
    await insertWeighing({ documentNumber: '0004', netKg: 26470, stage: 'dispatch' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper', stage: 'receipt' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('leaves out a document whose company awaits confirmation and counts it', async () => {
    await insertWeighing({ documentNumber: '0005', netKg: 26380, stage: 'receipt' });
    const proposed = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0006', stage: 'receipt' });
    await insertNumberLine(database, { workspaceId, documentId: proposed, lineNo: 0, meaning: 'Trọng lượng hàng', number: 27790, unit: 'kg' });
    await insertParty(database, { workspaceId, documentId: proposed, role: 'customer', organizationId: chengLoongId, printedName: 'Chống Loong', isConfirmed: false });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
    expect(total.pending_name_documents).toBe(1);
  });

  it('leaves out a document that waits for review and counts it', async () => {
    await insertWeighing({ documentNumber: '0007', netKg: 26380, organizationId: null });
    await insertWeighing({ documentNumber: '0008', netKg: 27790, organizationId: null, status: 'needs_review' });

    const total = await runTotal();

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
    expect(total.review_documents).toBe(1);
  });

  it('leaves the item lines out of a document total', async () => {
    const invoiceId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0009', kind: 'hóa đơn' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 0, meaning: 'Thành tiền', number: 500000, unit: 'vnd', item: 'Lốp' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 1, meaning: 'Thành tiền', number: 3500000, unit: 'vnd', item: 'Nhớt' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 2, meaning: 'Tổng tiền thanh toán', number: 4000000, unit: 'vnd' });

    const total = await runTotal({ meaning: 'Thành tiền', lines: 'document' });

    expect(total.groups).toEqual([]);
    expect(total.without_number).toBe(1);
  });

  it('groups by the day of the date meaning the admin chose', async () => {
    await insertWeighedAfterMidnight();

    const total = await runTotal({ group_by: 'day', date_meaning: 'Thời điểm cân lần 2' });

    expect(total.groups).toEqual([{ group: '2026-11-01', unit: 'kg', count: 1, sum: '27000', min: '27000', max: '27000' }]);
  });

  it('groups by the document date when no date meaning is given', async () => {
    await insertWeighedAfterMidnight();

    const total = await runTotal({ group_by: 'day', date_meaning: null });

    expect(total.groups).toEqual([{ group: '2026-10-31', unit: 'kg', count: 1, sum: '27000', min: '27000', max: '27000' }]);
  });

  it('keeps different count units apart', async () => {
    const pieces = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0011' });
    await insertNumberLine(database, { workspaceId, documentId: pieces, lineNo: 0, meaning: 'Số lượng', number: 3, unit: 'cái', item: 'Lốp' });
    const boxes = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0012' });
    await insertNumberLine(database, { workspaceId, documentId: boxes, lineNo: 0, meaning: 'Số lượng', number: 2, unit: 'hộp', item: 'Nhớt' });

    const total = await runTotal({ meaning: 'Số lượng', lines: 'item' });

    expect(total.groups).toEqual([
      { group: null, unit: 'cái', count: 1, sum: '3', min: '3', max: '3' },
      { group: null, unit: 'hộp', count: 1, sum: '2', min: '2', max: '2' },
    ]);
  });

  it('counts the saved messages that were not read again', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });

    const total = await runTotal();

    expect(total.not_reread_messages).toBe(1);
  });

  it('lists each meaning with the number of documents that hold it', async () => {
    await insertWeighing({ documentNumber: '0013', netKg: 26380 });
    const second = await insertWeighing({ documentNumber: '0014', netKg: 27790 });
    await insertNumberLine(database, { workspaceId, documentId: second, lineNo: 1, meaning: 'Trọng lượng hàng sau khấu trừ', number: 27700, unit: 'kg' });

    const list = await runList();

    expect(list.numbers).toEqual([
      { meaning: 'Trọng lượng hàng', value_type: 'number', unit: 'kg', document_count: 2, item_document_count: 0 },
      { meaning: 'Trọng lượng hàng sau khấu trừ', value_type: 'number', unit: 'kg', document_count: 1, item_document_count: 0 },
    ]);
  });

  it('shows each spelling of a company that matches the text', async () => {
    await insertAlias(database, { workspaceId, organizationId: chengLoongId, printedName: 'Công ty TNHH Chống Loong Bình Dương Paper' });
    await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty Hòa Phát' });

    const list = await runListOrganizations({ text: 'cheng' });

    expect(list.organizations).toEqual([
      {
        name: 'Công ty TNHH Cheng Loong Bình Dương Paper',
        type: 'company',
        aliases: ['Công ty TNHH Cheng Loong Bình Dương Paper', 'Công ty TNHH Chống Loong Bình Dương Paper'],
        document_count: 0,
      },
    ]);
  });

  it('never reads the documents of another workspace', async () => {
    await insertWeighing({ documentNumber: '0015', netKg: 26380 });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    const otherDocumentId = await insertNumberedDocument(database, { workspaceId: otherWorkspaceId, userId: vyUserId, documentNumber: '0016' });
    await insertNumberLine(database, { workspaceId: otherWorkspaceId, documentId: otherDocumentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: 26380, unit: 'kg' });

    const total = await runTotal();

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('counts a document with two dates of one meaning once, on the earliest date', async () => {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0017' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: 27000, unit: 'kg' });
    await insertDateLine(database, { workspaceId, documentId, lineNo: 1, meaning: 'Thời điểm cân lần 1', at: '2026-10-31 23:50' });
    await insertDateLine(database, { workspaceId, documentId, lineNo: 2, meaning: 'Thời điểm cân lần 1', at: '2026-11-01 00:10' });

    const total = await runTotal({ group_by: 'day', date_meaning: 'Thời điểm cân lần 1' });

    expect(total.groups).toEqual([{ group: '2026-10-31', unit: 'kg', count: 1, sum: '27000', min: '27000', max: '27000' }]);
  });

  it('totals without a group when a date meaning is named but nothing needs the date', async () => {
    await insertWeighedAfterMidnight();

    const total = await runTotal({ group_by: 'none', date_meaning: 'Thời điểm cân lần 2' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '27000', min: '27000', max: '27000' }]);
  });

  it('keeps only the documents where the company holds the given role', async () => {
    await insertWeighing({ documentNumber: '0018', netKg: 26380 });
    const issued = await insertWeighing({ documentNumber: '0019', netKg: 27790, organizationId: null });
    await insertParty(database, { workspaceId, documentId: issued, role: 'issuer', organizationId: chengLoongId, printedName: 'Cheng Loong' });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper', role: 'customer' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('does not count a document as waiting when another party of it is already confirmed', async () => {
    const documentId = await insertWeighing({ documentNumber: '0020', netKg: 26380 });
    await insertParty(database, { workspaceId, documentId, role: 'issuer', organizationId: chengLoongId, printedName: 'Chống Loong', isConfirmed: false });

    const total = await runTotal({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
    expect(total.pending_name_documents).toBe(0);
  });

  it('keeps only the documents of the given kind, whatever the accents and case', async () => {
    await insertWeighing({ documentNumber: '0021', netKg: 26380, kind: 'phiếu cân xe' });
    await insertWeighing({ documentNumber: '0022', netKg: 27790, kind: 'hóa đơn' });

    const total = await runTotal({ kind: 'PHIEU CAN XE' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('keeps only the documents of the given plate, however it is written', async () => {
    await insertWeighing({ documentNumber: '0023', netKg: 26380, vehiclePlate: '29C12345' });
    await insertWeighing({ documentNumber: '0024', netKg: 27790, vehiclePlate: '30H67890' });

    const total = await runTotal({ plate: '29c-123.45' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it('keeps only the documents whose date falls in the range, and drops those without that date', async () => {
    for (const [documentNumber, netKg, at] of [['0025', 26380, '2026-11-05 08:00'], ['0026', 27790, '2026-11-06 08:00']] as const) {
      const documentId = await insertWeighing({ documentNumber, netKg, organizationId: null });
      await insertDateLine(database, { workspaceId, documentId, lineNo: 1, meaning: 'Thời điểm cân lần 2', at });
    }
    await insertWeighing({ documentNumber: '0027', netKg: 100, organizationId: null });

    const total = await runTotal({ date_meaning: 'Thời điểm cân lần 2', date_from: '2026-11-05', date_to: '2026-11-05' });

    expect(total.groups).toEqual([{ group: null, unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' }]);
  });

  it.each(['date_from', 'date_to'])('refuses an impossible %s', async (field) => {
    const output = await runTool('total_document_numbers', { ...buildTotalArguments(), [field]: '2026-02-30' }, duy);

    expect(JSON.parse(output)).toEqual({ ok: false, error: INVALID_DATE_ERROR });
  });

  it('refuses an impossible date when listing the number meanings', async () => {
    const output = await runTool('list_document_numbers', { ...buildListArguments(), date_to: '2026-13-01' }, duy);

    expect(JSON.parse(output)).toEqual({ ok: false, error: INVALID_DATE_ERROR });
  });

  it('groups by the month of the document date', async () => {
    await insertWeighedAfterMidnight();

    const total = await runTotal({ group_by: 'month', date_meaning: 'Thời điểm cân lần 2' });

    expect(total.groups).toEqual([{ group: '2026-11', unit: 'kg', count: 1, sum: '27000', min: '27000', max: '27000' }]);
  });

  it('groups by the kind of document', async () => {
    await insertWeighing({ documentNumber: '0028', netKg: 26380, kind: 'phiếu cân xe' });
    await insertWeighing({ documentNumber: '0029', netKg: 27790, kind: 'hóa đơn' });

    const total = await runTotal({ group_by: 'kind' });

    expect(total.groups).toEqual([
      { group: 'hóa đơn', unit: 'kg', count: 1, sum: '27790', min: '27790', max: '27790' },
      { group: 'phiếu cân xe', unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' },
    ]);
  });

  it('groups by the plate of the vehicle', async () => {
    await insertWeighing({ documentNumber: '0030', netKg: 26380, vehiclePlate: '29C12345' });
    await insertWeighing({ documentNumber: '0031', netKg: 27790, vehiclePlate: '30H67890' });

    const total = await runTotal({ group_by: 'plate' });

    expect(total.groups).toEqual([
      { group: '29C12345', unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' },
      { group: '30H67890', unit: 'kg', count: 1, sum: '27790', min: '27790', max: '27790' },
    ]);
  });

  it('groups by the stage of the document', async () => {
    await insertWeighing({ documentNumber: '0032', netKg: 26380, stage: 'receipt' });
    await insertWeighing({ documentNumber: '0033', netKg: 26470, stage: 'dispatch' });
    await insertWeighing({ documentNumber: '0034', netKg: 100 });

    const total = await runTotal({ group_by: 'stage' });

    expect(total.groups).toEqual([
      { group: 'dispatch', unit: 'kg', count: 1, sum: '26470', min: '26470', max: '26470' },
      { group: 'receipt', unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' },
      { group: null, unit: 'kg', count: 1, sum: '100', min: '100', max: '100' },
    ]);
  });

  it('groups by the confirmed company, one group per document', async () => {
    const hoaPhatId = await insertOrganizationWithAlias(database, { workspaceId, name: 'Công ty Hòa Phát' });
    await insertWeighing({ documentNumber: '0035', netKg: 26380 });
    const shared = await insertWeighing({ documentNumber: '0036', netKg: 100 });
    await insertParty(database, { workspaceId, documentId: shared, role: 'issuer', organizationId: hoaPhatId, printedName: 'Hòa Phát' });
    await insertWeighing({ documentNumber: '0037', netKg: 7, organizationId: null });

    const total = await runTotal({ group_by: 'organization' });

    expect(total.groups).toEqual([
      { group: 'Công ty Hòa Phát', unit: 'kg', count: 1, sum: '100', min: '100', max: '100' },
      { group: 'Công ty TNHH Cheng Loong Bình Dương Paper', unit: 'kg', count: 1, sum: '26380', min: '26380', max: '26380' },
      { group: null, unit: 'kg', count: 1, sum: '7', min: '7', max: '7' },
    ]);
  });

  it.each([['group_by', 'weekly'], ['lines', 'all'], ['role', 'boss'], ['stage', 'storage']])('refuses an unknown value of %s', async (field, value) => {
    const output = await runTool('total_document_numbers', { ...buildTotalArguments(), [field]: value }, duy);

    expect(JSON.parse(output)).toEqual({ ok: false, error: `Dữ liệu không hợp lệ: ${field}` });
  });

  it('never counts the messages of another workspace as not read again', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy' });

    const total = await runTotal();

    expect(total.not_reread_messages).toBe(0);
  });

  it('does not count a saved message that has a document source or a re-read row', async () => {
    const documentId = await insertWeighing({ documentNumber: '0038', netKg: 26380 });
    const read = await insertChatMessage(database, { workspaceId, userId: hungUserId, author: 'user', text: 'tin nhắn', createdAt: new Date('2026-11-05T10:00:00+07:00') });
    const sourced = await insertChatMessage(database, { workspaceId, userId: hungUserId, author: 'user', text: 'tin nhắn', createdAt: new Date('2026-11-05T10:00:00+07:00') });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', messageId: read });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', messageId: sourced });
    await insertReadOfMessage(database, { workspaceId, messageId: read });
    await insertSourceOfMessage(database, { workspaceId, documentId, messageId: sourced });

    const total = await runTotal();

    expect(total.not_reread_messages).toBe(0);
  });

  it('lists number meanings and date meanings with the documents that hold them at each level', async () => {
    const invoiceId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0039', kind: 'hóa đơn' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 0, meaning: 'Thành tiền', number: 500000, unit: 'vnd', item: 'Lốp' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 1, meaning: 'Thành tiền', number: 3500000, unit: 'vnd', item: 'Nhớt' });
    await insertNumberLine(database, { workspaceId, documentId: invoiceId, lineNo: 2, meaning: 'Tổng tiền thanh toán', number: 4000000, unit: 'vnd' });
    await insertDateLine(database, { workspaceId, documentId: invoiceId, lineNo: 3, meaning: 'Thời điểm cân lần 2', at: '2026-11-01 08:00' });

    const list = await runList();

    expect(list.numbers).toEqual([
      { meaning: 'Thành tiền', value_type: 'number', unit: 'vnd', document_count: 0, item_document_count: 1 },
      { meaning: 'Thời điểm cân lần 2', value_type: 'date', unit: null, document_count: 1, item_document_count: 0 },
      { meaning: 'Tổng tiền thanh toán', value_type: 'number', unit: 'vnd', document_count: 1, item_document_count: 0 },
    ]);
  });

  it('lists only the meanings of the documents that match the filters', async () => {
    await insertWeighing({ documentNumber: '0040', netKg: 26380 });
    const other = await insertWeighing({ documentNumber: '0041', netKg: 120, organizationId: null });
    await insertNumberLine(database, { workspaceId, documentId: other, lineNo: 1, meaning: 'Số km', number: 120, unit: 'km' });

    const list = await runList({ organization: 'Công ty TNHH Cheng Loong Bình Dương Paper' });

    expect(list.numbers.map((entry) => entry.meaning)).toEqual(['Trọng lượng hàng']);
  });

  it('never lists the meanings of another workspace', async () => {
    await insertWeighing({ documentNumber: '0042', netKg: 26380 });
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    const otherDocumentId = await insertNumberedDocument(database, { workspaceId: otherWorkspaceId, userId: vyUserId, documentNumber: '0043' });
    await insertNumberLine(database, { workspaceId: otherWorkspaceId, documentId: otherDocumentId, lineNo: 0, meaning: 'Số km', number: 120, unit: 'km' });

    const list = await runList();

    expect(list.numbers.map((entry) => entry.meaning)).toEqual(['Trọng lượng hàng']);
  });

  it('never lists the companies of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    await insertOrganizationWithAlias(database, { workspaceId: otherWorkspaceId, name: 'Công ty Hòa Phát' });

    const list = await runListOrganizations();

    expect(list.organizations.map((organization) => organization.name)).toEqual(['Công ty TNHH Cheng Loong Bình Dương Paper']);
  });

  async function insertWeighedAfterMidnight(): Promise<void> {
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber: '0010', documentDate: '2026-10-31' });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: 27000, unit: 'kg' });
    await insertDateLine(database, { workspaceId, documentId, lineNo: 1, meaning: 'Thời điểm cân lần 2', at: '2026-11-01 08:00' });
  }

  type Weighing = {
    documentNumber: string;
    netKg: number;
    stage?: 'dispatch' | 'receipt';
    status?: 'accepted' | 'needs_review';
    organizationId?: string | null;
    kind?: string;
    vehiclePlate?: string;
  };

  async function insertWeighing(row: Weighing): Promise<string> {
    const { documentNumber, stage, status, kind, vehiclePlate } = row;
    const documentId = await insertNumberedDocument(database, { workspaceId, userId: hungUserId, documentNumber, stage, status, kind, vehiclePlate });
    await insertNumberLine(database, { workspaceId, documentId, lineNo: 0, meaning: 'Trọng lượng hàng', number: row.netKg, unit: 'kg' });
    const organizationId = row.organizationId === undefined ? chengLoongId : row.organizationId;
    if (organizationId !== null) await insertParty(database, { workspaceId, documentId, role: 'customer', organizationId, printedName: 'Cheng Loong' });
    return documentId;
  }

  async function runList(overrides: TotalArguments = {}, scope: AccessScope = duy): Promise<ListOutput> {
    return JSON.parse(await runTool('list_document_numbers', { ...buildListArguments(), ...overrides }, scope)) as ListOutput;
  }

  function buildListArguments(): TotalArguments {
    return { organization: null, role: null, stage: null, kind: null, plate: null, date_meaning: null, date_from: null, date_to: null };
  }

  async function runListOrganizations(overrides: TotalArguments = {}, scope: AccessScope = duy): Promise<OrganizationsOutput> {
    return JSON.parse(await runTool('list_organizations', { text: null, ...overrides }, scope)) as OrganizationsOutput;
  }

  async function runTotal(overrides: TotalArguments = {}, scope: AccessScope = duy): Promise<TotalOutput> {
    return JSON.parse(await runTool('total_document_numbers', { ...buildTotalArguments(), ...overrides }, scope)) as TotalOutput;
  }

  function buildTotalArguments(): TotalArguments {
    return {
      meaning: 'Trọng lượng hàng',
      lines: 'document',
      organization: null,
      role: null,
      stage: null,
      kind: null,
      plate: null,
      date_meaning: null,
      date_from: null,
      date_to: null,
      group_by: 'none',
    };
  }

  async function runTool(name: string, args: object, scope: AccessScope): Promise<string> {
    const dependencies = { database: pool, clock, attachments: new PhotoAttachments(), created: new CreatedTasks(null), invites: new CreatedInvites(), nameReview: new NameReviewRequest(), guard: new AdminTextGuard(false) };
    return runAdminTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
