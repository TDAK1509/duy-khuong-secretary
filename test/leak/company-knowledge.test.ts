import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry, listLinkedPaperIds } from './support/paper-fixtures.ts';
import { readSheetCells, readSheetColumn } from './support/read-sheet-column.ts';
import { resetDatabase } from './support/reset-database.ts';
import { A_DRIVER_MEMBER_ID, WORKSPACE_A_ID } from './support/seed-ids.ts';
import type { ReaderResult } from '../../src/services/reading/reader-service.ts';
import { RecordingReader } from './support/recording-reader.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

const A_DRIVER_USER_ID = 'aaaaaaaa-0001-4000-8000-000000000002';

const TRIP_PLATE = '51C12345';

const SEEDED_WAGE_ENTRY_ID = 'aaaaaaaa-0014-4000-8000-000000000001';

const PAPER_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: TRIP_PLATE, date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' };

beforeEach(async () => {
  await resetDatabase(databases.owner);
  await databases.owner.query('DELETE FROM company_knowledge_entries WHERE id = $1', [SEEDED_WAGE_ENTRY_ID]);
});

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

test('saving with the equal-weight outcome sets it and a later false keeps it', async () => {
  await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_goods: 'Đá', then_equal_weights: true }));
  await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_goods: 'Đá', then_wage_vnd: 700000 }));
  const { rows } = await databases.owner.query<{ equal: boolean }>('SELECT then_equal_weights AS equal FROM company_knowledge_entries WHERE when_goods = $1', ['Đá']);
  assert.deepEqual(rows, [{ equal: true }]);
});

test('the paper export shows the fixed outcome columns of the linked entry', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', customer: 'Gamma', wageVnd: 700000 }));
  const bytes = await exportPapers();
  assert.deepEqual(await readSheetColumn(bytes, 'Khách hàng'), ['Gamma']);
  assert.deepEqual(await readSheetColumn(bytes, 'Lương tài xế'), ['700000']);
});

test('the paper export shows the equal-weight column only when an entry sets it', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 }));
  assert.equal(await readSheetColumn(await exportPapers(), 'Khối lượng lấy = khối lượng đổ'), null);
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', equalWeights: true }));
  assert.deepEqual(await readSheetColumn(await exportPapers(), 'Khối lượng lấy = khối lượng đổ'), ['Có']);
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

test('a drop-off outcome does not make a paper match', async () => {
  await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', thenDropoff: 'Beta', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('the trip report falls back to the drop-off outcome', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Đá' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta' }));
  assert.deepEqual(await exportTripColumn({ name: 'Nơi đổ hàng', source: 'field', field: 'dropoff_place', value_name: null }), ['Beta']);
});

test('the trip report keeps the cross-plate pair after the model step', async () => {
  await insertCrossPlateTrip();
  const methods = await readSheetColumn(await exportTripBytes(PLATE_COLUMN, null, new NoPairsReader()), 'Cách ghép phiếu');
  assert.equal(methods?.filter((method) => method === 'Khớp trọng lượng').length, 1);
});

test('the trip notes name both plates of a cross-plate pair', async () => {
  await insertCrossPlateTrip();
  const notes = await readSheetCells(await exportTripBytes(PLATE_COLUMN, null, new NoPairsReader()), 'Ghi chú');
  assert.ok(notes.includes('Biển số hai phiếu khác một ký tự (51C12345 / 51C12346); ghép theo kiến thức công ty: khối lượng lấy bằng khối lượng đổ.'));
});

test('the 100th entry of a workspace saves', async () => {
  await fillWorkspaceEntries(99);
  const saved = JSON.parse(await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 700000 }))) as SavedKnowledge;
  assert.equal(saved.action, 'added');
  assert.equal(await countWorkspaceEntries(), 100);
});

test('the 101st entry of a workspace is refused and nothing is written', async () => {
  await fillWorkspaceEntries(100);
  const output = await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 700000 }));
  assert.equal(JSON.parse(output).error, 'Đã có 100 mục kiến thức công ty, là mức tối đa. Chưa lưu gì. Xóa mục không còn dùng bằng delete_company_knowledge rồi lưu lại.');
  assert.equal(await countWorkspaceEntries(), 100);
});

test('an update of an existing entry works when the workspace has 100 entries', async () => {
  await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000 });
  await fillWorkspaceEntries(100);
  const saved = JSON.parse(await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 700000 }))) as SavedKnowledge;
  assert.equal(saved.action, 'updated');
  assert.equal(await countWorkspaceEntries(), 100);
});

test('a save that matches five papers returns the three newest as examples', async () => {
  for (const day of ['01', '02', '03', '04', '05']) await insertNumberedAlphaTicket(`T00${day}`, `2026-03-${day}`);
  const saved = await saveAlphaWage();
  assert.equal(saved.linked_documents, 5);
  assert.deepEqual(saved.example_documents?.map((example) => example.document_number), ['T0005', 'T0004', 'T0003']);
});

test('a save that matches two papers returns two examples', async () => {
  await insertNumberedAlphaTicket('T0001', '2026-03-01');
  await insertNumberedAlphaTicket('T0002', '2026-03-02');
  const saved = await saveAlphaWage();
  assert.deepEqual(saved.example_documents?.map((example) => example.document_number), ['T0002', 'T0001']);
});

test('a save that matches nothing returns no examples', async () => {
  const saved = await saveAlphaWage();
  assert.equal(saved.linked_documents, 0);
  assert.deepEqual(saved.example_documents, []);
});

test('an example without a plate leaves the plate out', async () => {
  const paperId = await insertPaper(databases.owner, { kind: 'handover-record', plate: null, date: '2026-03-05', parties: [{ role: 'issuer', name: 'Alpha' }] });
  await databases.owner.query('UPDATE documents SET document_number = $2 WHERE id = $1', [paperId, 'H0001']);
  const saved = await saveAlphaWage();
  assert.deepEqual(saved.example_documents, [{ kind: 'handover-record', document_number: 'H0001', document_date: '2026-03-05' }]);
});

test('an update also returns examples', async () => {
  await insertNumberedAlphaTicket('T0001', '2026-03-01');
  await insertNumberedAlphaTicket('T0002', '2026-03-02');
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000 });
  await linkEntry(databases.runtime, entry);
  const saved = JSON.parse(await callChatTool(databases.runtime, 'update_company_knowledge', { ...saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 750000 }), entry_id: entry })) as SavedKnowledge;
  assert.deepEqual(saved.example_documents?.map((example) => example.document_number), ['T0002', 'T0001']);
});

type SavedKnowledge = { action: string; changes: unknown[]; linked_documents?: number; example_documents?: Record<string, string>[] };

async function saveAlphaWage(): Promise<SavedKnowledge> {
  return JSON.parse(await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_pickup_company: 'Alpha', then_wage_vnd: 700000 }))) as SavedKnowledge;
}

async function insertNumberedAlphaTicket(documentNumber: string, date: string): Promise<void> {
  const paperId = await insertPaper(databases.owner, { plate: '51C12345', date, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await databases.owner.query('UPDATE documents SET document_number = $2 WHERE id = $1', [paperId, documentNumber]);
}

function saveArguments(given: Record<string, string | number | boolean>): Record<string, string | number | boolean | null> {
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
    then_shown_goods: null,
    then_wage_vnd: null,
    then_rate_vnd_per_ton: null,
    then_allowance_vnd: null,
    then_equal_weights: false,
    then_note: null,
    replace_conflicts: false,
    notes_checked: true,
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

const PLATE_COLUMN: TripColumn = { name: 'Biển số', source: 'field', field: 'plate', value_name: null };

class NoPairsReader extends RecordingReader {
  override async read(): Promise<ReaderResult> {
    return { ok: true, json: { pairs: [] }, usage: null };
  }
}

async function insertCrossPlateTrip(): Promise<void> {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27080, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12346', date: '2026-03-06', weightKg: 27080, parties: [{ role: 'supplier', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', equalWeights: true }));
}

type TripColumn = { name: string; source: string; field: string | null; value_name: string | null };

async function exportTripColumn(column: TripColumn): Promise<string[] | null> {
  const bytes = await exportTripBytes(column, TRIP_PLATE, new RecordingReader());
  return bytes.length === 0 ? null : readSheetColumn(bytes, column.name);
}

async function exportTripBytes(column: TripColumn, plate: string | null, dropOffReader: RecordingReader): Promise<Uint8Array> {
  const harness = createToolHarness(databases.runtime, { dropOffReader });
  await harness.runTool('chat-gate', 'export_trip_report_xlsx', { title: 'Báo cáo', date_from: '2026-03-01', date_to: '2026-03-31', plate, columns: [column], layout: null });
  const [file] = harness.storage.listStoredFiles();
  return file?.bytes ?? new Uint8Array();
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

async function fillWorkspaceEntries(total: number): Promise<void> {
  await databases.owner.query(
    `INSERT INTO company_knowledge_entries (workspace_id, statement, when_goods, then_note)
     SELECT $1, 'filler', 'filler ' || number, 'filler' FROM generate_series(1, $2::int - (SELECT count(*)::int FROM company_knowledge_entries WHERE workspace_id = $1)) AS number`,
    [WORKSPACE_A_ID, total],
  );
}

async function countWorkspaceEntries(): Promise<number> {
  const { rows } = await databases.owner.query<{ count: number }>('SELECT count(*)::int AS count FROM company_knowledge_entries WHERE workspace_id = $1', [WORKSPACE_A_ID]);
  return rows[0]?.count ?? 0;
}
