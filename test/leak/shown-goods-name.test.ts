import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry, listLinkedPaperIds } from './support/paper-fixtures.ts';
import { readSheetColumn } from './support/read-sheet-column.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';
import { createToolHarness } from './support/tool-harness.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

type StoredEntry = { when_goods: string | null; when_pickup_name: string | null; then_shown_goods_name: string | null };

test('goods at a pickup company shown as a name saves as one entry', async () => {
  await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ when_goods: 'Than', when_pickup_company: 'Alpha', then_shown_goods: 'Than đá' }));
  assert.deepEqual(await listWorkspaceEntries(), [{ when_goods: 'Than', when_pickup_name: 'Alpha', then_shown_goods_name: 'Than đá' }]);
});

test('the paper export shows the shown goods name of the linked entry', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { goods: 'Than', shownGoodsName: 'Than đá' }));
  assert.deepEqual(await exportPaperColumn('Tên hàng hiển thị'), ['Than đá']);
});

test('the trip report shows the shown goods name of the linked entry', async () => {
  await insertPairedTrip('Than cám loại 2');
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { goods: 'Than', shownGoodsName: 'Than đá' }));
  assert.deepEqual(await exportTripGoods(), ['Than đá']);
});

test('the trip report keeps the printed goods name when no entry gives a shown name', async () => {
  await insertPairedTrip('Cát');
  assert.deepEqual(await exportTripGoods(), ['Cát']);
});

test('a goods name with a pickup condition applies only at that pickup', async () => {
  const atAlpha = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than' }] });
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Beta' }], lines: [{ label: 'Hàng hóa', value: 'Than' }] });
  const entry = await insertEntry(databases.owner, { goods: 'Than', pickup: 'Alpha', shownGoodsName: 'Than đá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [atAlpha]);
});

async function insertPairedTrip(goods: string): Promise<void> {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: goods }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
}

async function exportTripGoods(): Promise<string[] | null> {
  const harness = createToolHarness(databases.runtime);
  const column = { name: 'Hàng hóa', source: 'field', field: 'goods', value_name: null };
  await harness.runTool('chat-gate', 'export_trip_report_xlsx', { title: 'Báo cáo', date_from: '2026-03-01', date_to: '2026-03-31', plate: '51C12345', columns: [column], layout: null });
  const [file] = harness.storage.listStoredFiles();
  return file === undefined ? null : readSheetColumn(file.bytes, 'Hàng hóa');
}

async function exportPaperColumn(header: string): Promise<string[] | null> {
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_documents_xlsx', { organization: null, role: null, stage: null, kind: null, plate: '51C12345', date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' });
  const [file] = harness.storage.listStoredFiles();
  return file === undefined ? null : readSheetColumn(file.bytes, header);
}

function saveArguments(given: Record<string, string>): Record<string, string | null> {
  return {
    statement: 'Hàng có chữ Than ở Alpha hiển thị là Than đá',
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
    then_note: null,
    ...given,
  };
}

async function listWorkspaceEntries(): Promise<StoredEntry[]> {
  const { rows } = await databases.owner.query<StoredEntry>('SELECT when_goods, when_pickup_name, then_shown_goods_name FROM company_knowledge_entries WHERE workspace_id = $1 AND then_shown_goods_name IS NOT NULL', [WORKSPACE_A_ID]);
  return rows;
}
