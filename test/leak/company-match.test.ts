import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertFact, insertPaper, linkFact, listLinkedPaperIds } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

const GOODS_DA = { label: 'Hàng hóa', value: 'Đá' };

test('a pickup company printed as supplier links the fact', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'supplier', name: 'Alpha' }], lines: [GOODS_DA] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Đá' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});

test('a pickup company that issued a receipt-stage ticket links the fact', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha' });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});

test('a handover record with item lines links the fact', async () => {
  const record = await insertPaper(databases.owner, { kind: 'biên bản giao nhận', stage: null, parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Số lượng', value: '3', item: 'Đá' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Đá' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [record]);
});

test('a paper without the pickup company does not link', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Beta' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha' });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), []);
});

test('a text message that names the pickup company does not link', async () => {
  await insertPaper(databases.owner, { kind: 'tin nhắn', stage: null, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha' });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), []);
});
