import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { listTripPapers } from '../../src/app/trips/list-trip-papers.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { insertFact, insertPaper, linkFact, listLinkedPaperIds, openWorkspaceA } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

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

test('with a pickup, the drop-off is not needed on the paper', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', dropoff: 'Beta' });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});

test('with a pickup, the trip report still shows the drop-off', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', dropoff: 'Beta' });
  await linkFact(databases.runtime, fact);
  const papers = await listTripPapers(openWorkspaceA(databases.runtime), { workspaceId: WORKSPACE_A_ID, dateFrom: '2026-03-05', dateTo: '2026-03-05', plate: null, limit: 10 });
  assert.deepEqual(papers.map((paper) => paper.route_dropoff), ['Beta']);
});

test('a drop-off-only fact does not link a paper without the drop-off company', async () => {
  await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Gamma' }] });
  const fact = await insertFact(databases.owner, { dropoff: 'Beta', values: [{ name: 'Lương tài xế', number: 600000, unit: 'đ' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), []);
});

test('a drop-off-only fact links a paper that prints the drop-off company', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'customer', name: 'Beta' }] });
  const fact = await insertFact(databases.owner, { dropoff: 'Beta', values: [{ name: 'Lương tài xế', number: 600000, unit: 'đ' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});

test('a two-word goods condition does not link goods that hold only its long word', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than cám' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Than đá' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), []);
});

test('a two-word goods condition links goods that hold both words', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than đá loại 1' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Than đá' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});

test('a short goods word does not match as a prefix', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Cát' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Cá' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), []);
});

test('a goods word of four or more letters matches as a prefix', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Clinker' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Hàng hóa', text: 'Clinke' }] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [ticket]);
});
