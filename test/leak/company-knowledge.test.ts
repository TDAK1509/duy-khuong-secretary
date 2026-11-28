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

test('saving the same conditions twice updates the entry', async () => {
  await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000 });
  const saved = JSON.parse(await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 700000 }))) as SavedKnowledge;
  assert.equal(saved.action, 'updated');
  assert.deepEqual(saved.changes, [{ kind: 'replaced', name: 'Lương tài xế', before: 600000, after: 700000 }]);
  const { rows } = await databases.owner.query<{ wage: string }>('SELECT then_wage_vnd::text AS wage FROM company_knowledge_entries WHERE when_pickup_name = $1', ['Alpha']);
  assert.deepEqual(rows, [{ wage: '700000' }]);
});

test('the paper export shows the fixed outcome columns of the linked entry', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', customer: 'Gamma', wageVnd: 700000 }));
  const bytes = await exportPapers();
  assert.deepEqual(await readSheetColumn(bytes, 'Khách hàng'), ['Gamma']);
  assert.deepEqual(await readSheetColumn(bytes, 'Lương tài xế'), ['700000']);
});

test('the paper export leaves out a column with no value', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 }));
  assert.equal(await readSheetColumn(await exportPapers(), 'Chi phí bồi dưỡng'), null);
});

test('the trip report reads the route drop-off from the entry', async () => {
  await insertPairedTrip();
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta', wageVnd: 700000 }));
  assert.deepEqual(await exportTripColumn({ name: 'Nơi đổ hàng', source: 'field', field: 'dropoff_place', value_name: null }), ['Beta']);
});

test('the trip report reads the wage from the entry', async () => {
  await insertPairedTrip();
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 }));
  assert.deepEqual(await exportTripColumn({ name: 'Lương', source: 'knowledge_value', field: null, value_name: 'Lương tài xế' }), ['700000']);
});

test('the freight amount is the rate times the trip weight', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', ratePerTonVnd: 150000 }));
  assert.deepEqual(await exportTripColumn({ name: 'Cước', source: 'knowledge_amount', field: null, value_name: 'Cước vận chuyển' }), ['4050000']);
});

test('a correction of one paper changes only that paper', async () => {
  const [first, second] = await insertGoodsTickets();
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  await correctGoods(first, 'Cát');
  assert.deepEqual([await readGoods(first), await readGoods(second)], ['Cát', 'Đá']);
  assert.equal(await readWage(entry), '700000');
});

test('a correction recalculates the links of that paper', async () => {
  const first = await insertGoodsTicket('T0001');
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Đá', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [first]);
  await correctGoods(first, 'Cát');
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('rewriting the plate of a driver updates the note entry of that driver', async () => {
  const { rows } = await databases.owner.query<{ id: string }>(
    `INSERT INTO company_knowledge_entries (workspace_id, statement, when_driver_user_id, then_note) VALUES ($1, 'plate note', $2, 'Biển số xe: 51C12345') RETURNING id`,
    ['aaaaaaaa-0002-4000-8000-000000000001', A_DRIVER_USER_ID],
  );
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('confirmed', 'rewrite_member_plate', { member_id: A_DRIVER_MEMBER_ID, vehicle_plate: '51C67890' });
  const note = await databases.owner.query<{ then_note: string }>('SELECT then_note FROM company_knowledge_entries WHERE id = $1', [rows[0]?.id]);
  assert.deepEqual(note.rows, [{ then_note: 'Biển số xe: 51C67890' }]);
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
