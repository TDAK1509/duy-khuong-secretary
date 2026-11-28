import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertEntry } from './support/paper-fixtures.ts';
import { decideChange, readChangeStatus, readWages, removeSeededEntries, returnEditedWage } from './support/apply-export-changes-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';

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
