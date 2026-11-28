import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { callChatTool } from './support/call-chat-tool.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry, insertPaper, linkEntry } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

const NOTE_ABOUT_ROUTE = 'hàng Đá ở Alpha chỉ đổ ở Gamma';

beforeEach(async () => {
  await resetDatabase(databases.owner);
  await databases.owner.query('DELETE FROM company_knowledge_entries WHERE workspace_id = $1', [WORKSPACE_A_ID]);
});

after(() => databases.close());

type Checked = { replaceConflicts: boolean; notesChecked: boolean };

const FIRST_CALL: Checked = { replaceConflicts: false, notesChecked: false };

const AFTER_PICKING_NEW: Checked = { replaceConflicts: true, notesChecked: true };

type SaveResult = {
  action: string;
  conflicts?: { entry_id: string; outcome: string; saved_value: string | number; new_value: string | number; shared_documents: number }[];
  related_notes?: { entry_id: string; note: string }[];
  same_route_entries?: { entry_id: string }[];
};

test('a different drop-off for an overlapping route returns a conflict', async () => {
  const first = await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta' });
  for (const plate of ['51C12345', '51C12346']) await insertStonePaper(plate);
  await linkEntry(databases.runtime, first);
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', then_dropoff: 'Gamma' }, FIRST_CALL);
  assert.deepEqual(result.conflicts, [{ entry_id: first, when: { goods: 'Đá', vehicle_plate: null, driver: null, pickup_company: null, dropoff_company: null }, outcome: 'Nơi đổ hàng', saved_value: 'Beta', new_value: 'Gamma', shared_documents: 2 }]);
});

test('a conflict saves nothing', async () => {
  await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta' });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', then_dropoff: 'Gamma' }, FIRST_CALL);
  assert.equal(result.action, 'conflict');
  assert.equal(await countEntries(), 1);
});

test('a conflict is found when no paper matches yet', async () => {
  await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000 });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Cát', then_wage_vnd: 750000 }, FIRST_CALL);
  assert.deepEqual(result.conflicts?.map((conflict) => [conflict.outcome, conflict.saved_value, conflict.new_value, conflict.shared_documents]), [['Lương tài xế', 600000, 750000, 0]]);
});

test('different plates do not conflict', async () => {
  await insertEntry(databases.owner, { plate: '51C12345', wageVnd: 600000 });
  const result = await saveRoute({ when_vehicle_plate: '51C67890', then_wage_vnd: 750000 }, FIRST_CALL);
  assert.equal(result.action, 'added');
});

test('replacing a conflict clears the old outcome and keeps the rest of the old entry', async () => {
  const first = await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta', wageVnd: 700000 });
  await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', then_dropoff: 'Gamma' }, AFTER_PICKING_NEW);
  assert.deepEqual(await readOutcomes(first), { then_dropoff: null, then_wage_vnd: '700000' });
});

test('replacing a conflict saves the new entry', async () => {
  await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta', wageVnd: 700000 });
  await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', then_dropoff: 'Gamma' }, AFTER_PICKING_NEW);
  const { rows } = await databases.owner.query('SELECT 1 FROM company_knowledge_entries WHERE when_goods = $1 AND then_dropoff = $2', ['Đá', 'Gamma']);
  assert.equal(rows.length, 1);
});

test('replacing the only outcome deletes the old entry', async () => {
  const first = await insertEntry(databases.owner, { goods: 'Đá', thenDropoff: 'Beta' });
  await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', then_dropoff: 'Gamma' }, AFTER_PICKING_NEW);
  assert.equal(await readOutcomes(first), null);
});

test('a company-wide note stops the first save', async () => {
  const note = await insertEntry(databases.owner, { note: NOTE_ABOUT_ROUTE });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_dropoff_company: 'Beta', then_wage_vnd: 700000 }, FIRST_CALL);
  assert.deepEqual(result.related_notes?.map((related) => [related.entry_id, related.note]), [[note, NOTE_ABOUT_ROUTE]]);
});

test('a note check saves nothing', async () => {
  await insertEntry(databases.owner, { note: NOTE_ABOUT_ROUTE });
  await saveRoute({ when_pickup_company: 'Alpha', when_dropoff_company: 'Beta', then_wage_vnd: 700000 }, FIRST_CALL);
  assert.equal(await countEntries(), 1);
});

test('the same save with notes_checked true writes', async () => {
  await insertEntry(databases.owner, { note: NOTE_ABOUT_ROUTE });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_dropoff_company: 'Beta', then_wage_vnd: 700000 }, { replaceConflicts: false, notesChecked: true });
  assert.equal(result.action, 'added');
});

test('a note on another plate does not stop the save', async () => {
  await insertEntry(databases.owner, { plate: '51C12345', note: 'xe này chỉ chở cát' });
  const result = await saveRoute({ when_vehicle_plate: '51C67890', then_wage_vnd: 750000 }, FIRST_CALL);
  assert.equal(result.action, 'added');
});

test('two routes from one pickup to different drop-offs do not conflict', async () => {
  await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta', wageVnd: 600000 });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_dropoff_company: 'Gamma', then_wage_vnd: 750000 }, FIRST_CALL);
  assert.equal(result.action, 'added');
});

test('after the admin picks the note drop-off, the old route entry is offered to delete', async () => {
  const oldRoute = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Đá', dropoff: 'Beta', wageVnd: 700000 });
  await insertEntry(databases.owner, { note: NOTE_ABOUT_ROUTE });
  const result = await saveRoute({ when_pickup_company: 'Alpha', when_goods: 'Đá', when_dropoff_company: 'Gamma', then_wage_vnd: 700000 }, { replaceConflicts: false, notesChecked: true });
  assert.deepEqual(result.same_route_entries?.map((entry) => entry.entry_id), [oldRoute]);
});

async function insertStonePaper(plate: string): Promise<void> {
  await insertPaper(databases.owner, { plate, parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Đá' }] });
}

async function saveRoute(given: Record<string, string | number>, checked: Checked): Promise<SaveResult> {
  const result = await callChatTool(databases.runtime, 'save_company_knowledge', saveArguments({ ...given, replace_conflicts: checked.replaceConflicts, notes_checked: checked.notesChecked }));
  return JSON.parse(result) as SaveResult;
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
    ...given,
  };
}

async function countEntries(): Promise<number> {
  const { rows } = await databases.owner.query<{ count: number }>('SELECT count(*)::int AS count FROM company_knowledge_entries WHERE workspace_id = $1', [WORKSPACE_A_ID]);
  return rows[0]?.count ?? 0;
}

async function readOutcomes(entryId: string): Promise<{ then_dropoff: string | null; then_wage_vnd: string | null } | null> {
  const { rows } = await databases.owner.query<{ then_dropoff: string | null; then_wage_vnd: string | null }>('SELECT then_dropoff, then_wage_vnd::text FROM company_knowledge_entries WHERE id = $1', [entryId]);
  return rows[0] ?? null;
}
