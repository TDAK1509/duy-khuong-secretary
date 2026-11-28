import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { listTripPapers } from '../../src/app/trips/list-trip-papers.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { ScriptedPairingReader, type ScriptedPair } from './support/scripted-pairing-reader.ts';
import { createToolHarness } from './support/tool-harness.ts';
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

test('a customer the admin names is saved as a value and does not limit the match', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const saved = JSON.parse(await callChatTool(databases.runtime, 'save_fact', {
    statement: 'Lấy hàng ở Alpha, khách hàng là Gamma',
    vehicle_plate: null,
    driver_member_id: null,
    pickup_company: 'Alpha',
    dropoff_company: null,
    values: [{ name: 'Khách hàng', number: null, unit: null, text: 'Gamma' }],
    fact_id: null,
  })) as { fact_id: string };
  assert.deepEqual(await listLinkedPaperIds(databases.owner, saved.fact_id), [ticket]);
});

const WAGE = { name: 'Lương tài xế', number: 700000, unit: 'đ' };

const NO_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: null, template: null, date_meaning: null };

type Totals = { amounts: { sum: number }[]; per_ton: { amount: number }[] };

async function totalValue(valueName: string, dateFrom: string, dateTo: string, pairs: ScriptedPair[] | null = null): Promise<Totals> {
  const harness = createToolHarness(databases.runtime, pairs === null ? {} : { dropOffReader: new ScriptedPairingReader(pairs) });
  const output = await harness.runTool('chat-gate', 'total_fact_values', { value_name: valueName, ...NO_FILTERS, date_from: dateFrom, date_to: dateTo, group_by: 'none' });
  return JSON.parse(output) as Totals;
}

test('a pickup paper and a drop-off paper of one built trip add the wage once', async () => {
  const pickup = await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const dropOff = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [WAGE] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), [pickup, dropOff].sort());
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06')).amounts[0]?.sum, 700000);
});

test('two trips of one truck on one day add the wage twice', async () => {
  const papers = [
    await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 07:00:00', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 13:00:00', weightKg: 25000, parties: [{ role: 'issuer', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 10:00:00', weightKg: 26980, parties: [{ role: 'supplier', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 16:00:00', weightKg: 24990, parties: [{ role: 'supplier', name: 'Alpha' }] }),
  ];
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [WAGE] });
  await linkFact(databases.runtime, fact);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, fact), papers.sort());
  const pairs = [{ pickup: 'p1', receipt: 'r1' }, { pickup: 'p2', receipt: 'r2' }];
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-05', pairs)).amounts[0]?.sum, 1400000);
});

test('a per-ton rate uses the weight of each built trip once', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  const fact = await insertFact(databases.owner, { pickup: 'Alpha', values: [{ name: 'Cước vận chuyển', number: 150000, unit: 'đ/tấn' }] });
  await linkFact(databases.runtime, fact);
  assert.equal((await totalValue('Cước vận chuyển', '2026-03-05', '2026-03-06')).per_ton[0]?.amount, 4050000);
});
