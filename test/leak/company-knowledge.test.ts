import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry, listLinkedPaperIds } from './support/paper-fixtures.ts';
import { readSheetColumn } from './support/read-sheet-column.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_DRIVER_MEMBER_ID } from './support/seed-ids.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

const A_DRIVER_USER_ID = 'aaaaaaaa-0001-4000-8000-000000000002';

const TRIP_PLATE = '51C12345';

const PAPER_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: TRIP_PLATE, date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' };

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());


test('an entry links a paper that prints its drop-off condition company in any role', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'customer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { dropoff: 'Beta', allowanceVnd: 100000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

type SavedKnowledge = { action: string; changes: unknown[] };

function saveArguments(given: Record<string, string | number>): Record<string, string | number | null> {
  return {
    statement: 'fixture statement',
    entry_id: null,
    when_goods: null,
    when_pickup_company: null,
    when_dropoff_company: null,
    when_vehicle_plate: null,
    when_driver_member_id: null,
    then_customer: null,
    then_dropoff: null,
    then_wage_vnd: null,
    then_rate_vnd_per_ton: null,
    then_allowance_vnd: null,
    then_note: null,
    ...given,
  };
}

async function exportPapers(): Promise<Uint8Array> {
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_documents_xlsx', PAPER_FILTERS);
  const [file] = harness.storage.listStoredFiles();
  return file?.bytes ?? new Uint8Array();
}

async function insertPairedTrip(): Promise<void> {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
}

type TripColumn = { name: string; source: string; field: string | null; value_name: string | null };

async function exportTripColumn(column: TripColumn): Promise<string[] | null> {
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_trip_report_xlsx', { title: 'Báo cáo', date_from: '2026-03-01', date_to: '2026-03-31', plate: TRIP_PLATE, columns: [column], layout: null });
  const [file] = harness.storage.listStoredFiles();
  return file === undefined ? null : readSheetColumn(file.bytes, column.name);
}

async function insertGoodsTickets(): Promise<[string, string]> {
  const first = await insertGoodsTicket('T0001');
  const second = await insertGoodsTicket('T0002');
  return [first, second];
}

async function insertGoodsTicket(documentNumber: string): Promise<string> {
  const paperId = await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Đá' }] });
  await databases.owner.query('UPDATE documents SET document_number = $2 WHERE id = $1', [paperId, documentNumber]);
  return paperId;
}

async function correctGoods(paperId: string, goods: string): Promise<void> {
  const { rows } = await databases.owner.query<{ document_number: string }>('SELECT document_number FROM documents WHERE id = $1', [paperId]);
  const text = `Sửa hàng hóa của phiếu ${rows[0]?.document_number} thành ${goods}`;
  const harness = createToolHarness(databases.runtime, { currentMessage: { id: 'aaaaaaaa-0020-4000-8000-0000000000f1', text } });
  await harness.runTool('chat-gate', 'correct_document', {
    new_plate: null, new_number: null, new_date: null, new_stage: null, printed_label: 'Hàng hóa', printed_value: goods, printed_meaning: null, printed_number: null, printed_unit: null,
    company_slot: null, company_name: null, last_photo: false, current_plate: null, current_number: rows[0]?.document_number ?? null, current_date: null, all_matching: false,
  });
}

async function readGoods(paperId: string): Promise<string | undefined> {
  const { rows } = await databases.owner.query<{ value: string }>(`SELECT value FROM document_lines WHERE document_id = $1 AND label = 'Hàng hóa'`, [paperId]);
  return rows[0]?.value;
}

async function readWage(entryId: string): Promise<string | undefined> {
  const { rows } = await databases.owner.query<{ wage: string }>('SELECT then_wage_vnd::text AS wage FROM company_knowledge_entries WHERE id = $1', [entryId]);
  return rows[0]?.wage;
}
