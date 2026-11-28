import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry } from './support/paper-fixtures.ts';
import { editDataSheet, FIRST_DATA_ROW, findColumn, sendReturnedFile } from './support/returned-export-files.ts';
import { exportAlphaPapers } from './support/returned-export-fixtures.ts';
import { decideChange, findNewestChangeId, listCustomerNames, readCustomers, readChangeStatus, readRates, returnEditedFreightFile, readWages, removeSeededEntries, returnEditedWage } from './support/apply-export-changes-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test('a wage change confirmed as company knowledge updates the entry', async () => {
  await removeSeededEntries(databases.owner);
  const changeId = await returnEditedWage(databases, 700000);
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge' });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId), await readWages(databases.owner)], ['applied', 'applied', [700000]]);
});

test('a confirmed knowledge change that hits a conflict stays pending', async () => {
  const changeId = await returnEditedWage(databases, 700000);
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge' });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId)], ['conflict', 'pending']);
});

test('a confirmed replacement completes the conflicting change', async () => {
  const changeId = await returnEditedWage(databases, 700000);
  await decideChange(databases, changeId, { cause: 'company_knowledge' });
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge', replace_conflicts: true, notes_checked: true });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId)], ['applied', 'applied']);
});

test('a dismissed change after a conflict saves nothing', async () => {
  const changeId = await returnEditedWage(databases, 700000);
  await decideChange(databases, changeId, { cause: 'company_knowledge' });
  const result = await decideChange(databases, changeId, { cause: 'dismiss' });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId), await readWages(databases.owner)], ['dismissed', 'dismissed', [500000, 600000]]);
});

test('a related note stops the knowledge change until it is checked', async () => {
  await removeSeededEntries(databases.owner);
  await insertEntry(databases.owner, { plate: '51C12345', note: 'Chỉ chạy buổi sáng' });
  const changeId = await returnEditedWage(databases, 700000);
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge' });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId)], ['check_notes', 'pending']);
});

test('a checked related note completes the knowledge change', async () => {
  await removeSeededEntries(databases.owner);
  await insertEntry(databases.owner, { plate: '51C12345', note: 'Chỉ chạy buổi sáng' });
  const changeId = await returnEditedWage(databases, 700000);
  await decideChange(databases, changeId, { cause: 'company_knowledge' });
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge', notes_checked: true });
  assert.deepEqual([result.action, await readChangeStatus(databases.owner, changeId)], ['applied', 'applied']);
});

test('a knowledge change is refused when the saved value changed after the export', async () => {
  await removeSeededEntries(databases.owner);
  const changeId = await returnEditedWage(databases, 700000);
  await databases.owner.query('UPDATE company_knowledge_entries SET then_wage_vnd = 650000 WHERE workspace_id = $1', [WORKSPACE_A_ID]);
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge' });
  assert.deepEqual([result.reason, await readChangeStatus(databases.owner, changeId)], ['stale', 'pending']);
});

test('an unlisted change id is refused', async () => {
  const result = await decideChange(databases, 'aaaaaaaa-0050-4000-8000-0000000000ff', { cause: 'dismiss' });
  assert.equal(result.reason, 'not_listed');
});

test('an unsupported cause is refused', async () => {
  const changeId = await returnEditedWage(databases, 700000);
  const result = await decideChange(databases, changeId, { cause: 'paper_reading' });
  assert.equal(result.reason, 'cause_not_offered');
});

test('a customer change confirmed as a paper reading changes only that paper', async () => {
  const bytes = await exportAlphaPapers(databases, { count: 2, customer: 'Gamma' });
  await sendReturnedFile(databases, await editDataSheet(bytes, (sheet) => {
    sheet.getRow(FIRST_DATA_ROW).getCell(findColumn(sheet, 'Khách hàng')).value = 'Delta';
  }));
  const result = await decideChange(databases, await findNewestChangeId(databases), { cause: 'paper_reading' });
  assert.deepEqual([result.action, await listCustomerNames(databases.owner), await readCustomers(databases.owner)], ['applied', ['Delta'], ['Gamma']]);
});

test('a freight amount confirmed as company knowledge updates the entry rate', async () => {
  await removeSeededEntries(databases.owner);
  await returnEditedFreightFile(databases, 4320000);
  const changeId = await findNewestChangeId(databases);
  const result = await decideChange(databases, changeId, { cause: 'company_knowledge' });
  assert.deepEqual([result.action, await readRates(databases.owner)], ['applied', [160000]]);
});

test('a review whose changes are all unsupported is applied at once', async () => {
  await returnEditedFreightFile(databases, 4050001);
  const { rows } = await databases.owner.query('SELECT status FROM company_export_reviews WHERE id <> ALL($1::uuid[])', [['aaaaaaaa-0049-4000-8000-000000000001', 'bbbbbbbb-0049-4000-8000-000000000001']]);
  assert.deepEqual(rows, [{ status: 'applied' }]);
});
