import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { FileStorage } from '../../src/services/storage/file-storage.ts';
import { listEntrySnapshots } from '../../src/app/facts/list-entry-snapshots.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry } from './support/paper-fixtures.ts';
import { countExports, findCell, listExportRows } from './support/read-export-records.ts';
import { listDataRows } from './support/read-marked-sheet.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

const TRIP_PLATE = '51C12345';

const PAPER_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: TRIP_PLATE, date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' };

const PLATE_COLUMN = { name: 'Biển số', source: 'field', field: 'plate', value_name: null };
const WAGE_COLUMN = { name: 'Lương', source: 'knowledge_value', field: null, value_name: 'Lương tài xế' };
const ALLOWANCE_COLUMN = { name: 'Bồi dưỡng', source: 'knowledge_value', field: null, value_name: 'Chi phí bồi dưỡng' };
const DROPOFF_DATE_COLUMN = { name: 'Ngày dỡ', source: 'field', field: 'dropoff_date', value_name: null };
const DROPOFF_WEIGHT_COLUMN = { name: 'KL dỡ', source: 'field', field: 'dropoff_weight_kg', value_name: null };
const PICKUP_DATE_COLUMN = { name: 'Ngày lấy', source: 'field', field: 'pickup_date', value_name: null };
const RATE_COLUMN = { name: 'Đơn giá', source: 'knowledge_value', field: null, value_name: 'Cước vận chuyển' };
const A_DRIVER_USER_ID = 'aaaaaaaa-0001-4000-8000-000000000002';
const FREIGHT_COLUMN = { name: 'Cước', source: 'knowledge_amount', field: null, value_name: 'Cước vận chuyển' };

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a paper export saves one row record with its paper', async () => {
  const paperId = await insertAlphaPaper();
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 }));
  await exportPapers();
  const rows = await listExportRows(databases.owner);
  assert.deepEqual(rows.map((row) => row.document_ids), [[paperId]]);
});

test('a knowledge cell names its entry', async () => {
  await insertAlphaPaper();
  const entryId = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  await linkEntry(databases.runtime, entryId);
  await exportPapers();
  const [row] = await listExportRows(databases.owner);
  const cell = findCell(row!, 'Lương tài xế');
  assert.deepEqual([cell.value_type, cell.value, cell.source?.kind, cell.source?.entry_id, cell.source?.field], ['number', 700000, 'entry', entryId, 'then_wage_vnd']);
});

test('a paired trip row saves both papers', async () => {
  const [pickupId, dropOffId] = await insertPairedTrip();
  await exportTrip([PLATE_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  assert.deepEqual([...row!.document_ids].sort(), [pickupId, dropOffId].sort());
});

test('two cells from two entries name their own entry', async () => {
  await insertAlphaPaper();
  const wageEntry = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  const allowanceEntry = await insertEntry(databases.owner, { plate: TRIP_PLATE, allowanceVnd: 100000 });
  await linkEntry(databases.runtime, wageEntry);
  await linkEntry(databases.runtime, allowanceEntry);
  await exportTrip([WAGE_COLUMN, ALLOWANCE_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  assert.deepEqual([findCell(row!, 'Lương').source?.entry_id, findCell(row!, 'Bồi dưỡng').source?.entry_id], [wageEntry, allowanceEntry]);
  assert.deepEqual([...row!.entry_ids].sort(), [wageEntry, allowanceEntry].sort());
});

test('the freight amount cell names its entry and its paper', async () => {
  const paperId = await insertAlphaPaper({ weightKg: 27000 });
  const entryId = await insertEntry(databases.owner, { pickup: 'Alpha', ratePerTonVnd: 150000 });
  await linkEntry(databases.runtime, entryId);
  await exportTrip([FREIGHT_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  const cell = findCell(row!, 'Cước');
  assert.equal(cell.value, 4050000);
  assert.deepEqual([cell.source?.kind, cell.source?.entry_id, cell.source?.document_id], ['computed', entryId, paperId]);
  assert.deepEqual([cell.source?.snapshot['rate_vnd_per_ton'], cell.source?.snapshot['weight_kg']], [150000, 27000]);
});

test('row records follow the sort of the report', async () => {
  const ticketIds = new Map<string, string>();
  for (const plate of ['51C11111', '51C22222', '51C33333']) ticketIds.set(plate, await insertPaper(databases.owner, { stage: 'dispatch', plate, date: '2026-02-10', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] }));
  const bytes = await exportTrip([PLATE_COLUMN], { plate: null, month: '2026-02', layout: { sort: [{ column: 0, direction: 'desc' }] } });
  const { headers, rows } = await listDataRows(bytes, '_row_id');
  const [firstRow] = rows;
  const rowId = firstRow?.cells[headers.indexOf('_row_id')];
  const record = (await listExportRows(databases.owner)).find((candidate) => candidate.id === rowId);
  assert.equal(firstRow?.cells[0], '51C33333');
  assert.deepEqual([record?.document_ids, record?.row_number], [[ticketIds.get('51C33333')], firstRow?.number]);
});

test('a failed upload leaves no record', async () => {
  await insertAlphaPaper();
  const harness = createToolHarness(databases.runtime);
  harness.dependencies.fileStorage = createFailingStorage();
  await assert.rejects(harness.runTool('chat-gate', 'export_documents_xlsx', PAPER_FILTERS));
  assert.equal(await countExports(databases.owner), 0);
});

test('deleting an entry keeps the export record', async () => {
  await insertAlphaPaper();
  const entryId = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  await linkEntry(databases.runtime, entryId);
  await exportPapers();
  await callChatTool(databases.runtime, 'delete_company_knowledge', { entry_id: entryId });
  const [row] = await listExportRows(databases.owner);
  const cell = findCell(row!, 'Lương tài xế');
  assert.deepEqual([row!.entry_ids, cell.source?.entry_id, cell.source?.snapshot['statement']], [[entryId], entryId, 'fixture entry']);
});

test('a pickup-only trip records no paper for its drop-off cells', async () => {
  await insertAlphaPaper({ weightKg: 27000 });
  await exportTrip([DROPOFF_DATE_COLUMN, DROPOFF_WEIGHT_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  assert.deepEqual([findCell(row!, 'Ngày dỡ').source, findCell(row!, 'KL dỡ').source], [null, null]);
});

test('a drop-off-only trip records no paper for its pickup cells', async () => {
  await insertPaper(databases.owner, { stage: 'receipt', plate: TRIP_PLATE, date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  await exportTrip([PICKUP_DATE_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  assert.equal(findCell(row!, 'Ngày lấy').source, null);
});

test('a driver-only entry keeps its driver condition in the snapshot', async () => {
  const { rows } = await databases.owner.query<{ id: string }>(
    `INSERT INTO company_knowledge_entries (workspace_id, statement, when_driver_user_id, then_wage_vnd) VALUES ($1, 'driver note', $2, 500000) RETURNING id`,
    [WORKSPACE_A_ID, A_DRIVER_USER_ID],
  );
  const snapshots = await listEntrySnapshots(databases.owner, WORKSPACE_A_ID, [rows[0]!.id]);
  assert.deepEqual(snapshots.get(rows[0]!.id)?.conditions, { when_driver_user_id: A_DRIVER_USER_ID });
});

test('a rate column records the per-ton unit', async () => {
  await insertAlphaPaper({ weightKg: 27000 });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', ratePerTonVnd: 150000 }));
  await exportTrip([RATE_COLUMN]);
  const [row] = await listExportRows(databases.owner);
  assert.equal(row!.columns.find((column) => column.name === 'Đơn giá')?.unit, 'đ/tấn');
});

async function insertAlphaPaper(spec: { weightKg?: number } = {}): Promise<string> {
  return insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, date: '2026-03-05', parties: [{ role: 'issuer', name: 'Alpha' }], ...spec });
}

async function insertPairedTrip(): Promise<[string, string]> {
  const pickupId = await insertPaper(databases.owner, { stage: 'dispatch', plate: TRIP_PLATE, date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const dropOffId = await insertPaper(databases.owner, { stage: 'receipt', plate: TRIP_PLATE, date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  return [pickupId, dropOffId];
}

async function exportPapers(): Promise<void> {
  await createToolHarness(databases.runtime).runTool('chat-gate', 'export_documents_xlsx', PAPER_FILTERS);
}

type TripColumn = { name: string; source: string; field: string | null; value_name: string | null };

type TripOptions = { plate?: string | null; month?: string; layout?: object | null };

async function exportTrip(columns: TripColumn[], { plate = TRIP_PLATE, month = '2026-03', layout = null }: TripOptions = {}): Promise<Uint8Array> {
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_trip_report_xlsx', { title: 'Báo cáo', date_from: `${month}-01`, date_to: `${month}-28`, plate, columns, layout });
  return harness.storage.listStoredFiles()[0]?.bytes ?? new Uint8Array();
}

function createFailingStorage(): FileStorage {
  return {
    put: async () => {
      throw new Error('storage is down');
    },
    get: async () => null,
    presignedUrl: async () => 'https://files.leak-test.invalid/none',
  };
}
