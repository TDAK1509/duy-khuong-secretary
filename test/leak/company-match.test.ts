import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { loadShownGoodsNames } from '../../src/app/goods-names/show-goods-name.ts';
import { buildTrips, type Trip } from '../../src/app/trips/build-trips.ts';
import { listReceiptPapers, listTripPapers } from '../../src/app/trips/list-trip-papers.ts';
import { loadTripPapers } from '../../src/app/trips/load-trip-papers.ts';
import { pairTrips } from '../../src/app/trips/pair-trips.ts';
import { callChatTool } from './support/call-chat-tool.ts';
import { NamedDropOffReader } from './support/named-drop-off-reader.ts';
import { ScriptedPairingReader } from './support/scripted-pairing-reader.ts';
import type { RecordingReader } from './support/recording-reader.ts';
import { createToolHarness } from './support/tool-harness.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { addCompanyAlias, insertEntry, insertPaper, linkEntry, listLinkedPaperIds, openWorkspaceA } from './support/paper-fixtures.ts';
import { resetDatabase } from './support/reset-database.ts';
import { WORKSPACE_A_ID } from './support/seed-ids.ts';

const databases = openLeakDatabases();

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

const GOODS_DA = { label: 'Hàng hóa', value: 'Đá' };

test('a pickup company printed as supplier links the entry', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'supplier', name: 'Alpha' }], lines: [GOODS_DA] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Đá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a pickup company that issued a receipt-stage ticket links the entry', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a handover record with item lines links the entry', async () => {
  const record = await insertPaper(databases.owner, { kind: 'biên bản giao nhận', stage: null, parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Số lượng', value: '3', item: 'Đá' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Đá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [record]);
});

test('a paper without the pickup company does not link', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('a text message that names the pickup company does not link', async () => {
  await insertPaper(databases.owner, { kind: 'tin nhắn', stage: null, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('an entry with a pickup and a drop-off links a paper that prints only the pickup', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('an entry with a pickup and a drop-off links a paper that prints only the drop-off', async () => {
  const receipt = await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [receipt]);
});

test('the trip report shows the drop-off of an entry with a pickup and a drop-off', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta' });
  await linkEntry(databases.runtime, entry);
  const papers = await listTripPapers(openWorkspaceA(databases.runtime), { workspaceId: WORKSPACE_A_ID, dateFrom: '2026-03-05', dateTo: '2026-03-05', plate: null, limit: 10 });
  assert.deepEqual(papers.map((paper) => paper.route_dropoff), ['Beta']);
});

test('a receipt-stage ticket issued by the pickup company is listed as a pickup', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha' }));
  assert.deepEqual(await listTripPaperIds(), { pickups: [ticket], receipts: [] });
});

test('a ticket issued under an alias of the pickup company is listed as a pickup', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', parties: [{ role: 'issuer', name: 'Alpha Group' }] });
  await addCompanyAlias(databases.owner, 'Alpha Group', 'Alpha');
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha' }));
  assert.deepEqual(await listTripPaperIds(), { pickups: [ticket], receipts: [] });
});

test('a receipt-stage ticket issued by another company stays a receipt', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', parties: [{ role: 'issuer', name: 'Beta' }, { role: 'supplier', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
  assert.deepEqual(await listTripPaperIds(), { pickups: [], receipts: [ticket] });
});

test('the ticket of the pickup company pairs with the drop-off ticket in the trip report', async () => {
  const pickup = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-05', weightKg: 27080, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const dropOff = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 27060, parties: [{ role: 'issuer', name: 'Beta' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha' }));
  const trips = await buildTripsOfTwoDays();
  assert.deepEqual(trips.map((trip) => [trip.pickup?.id, trip.dropOff?.id, trip.method]), [[pickup, dropOff, 'rule']]);
});

async function buildTripsOfTwoDays(): Promise<Trip[]> {
  const database = openWorkspaceA(databases.runtime);
  const query = { workspaceId: WORKSPACE_A_ID, dateFrom: '2026-03-05', dateTo: '2026-03-06', plate: null, limit: 10 };
  const papers = await loadTripPapers(database, query);
  if (papers === null) throw new Error('too many trip papers');
  const pairing = await pairTrips(null, papers, [], await loadShownGoodsNames(database, WORKSPACE_A_ID));
  return buildTrips({ ...papers, dateFrom: query.dateFrom, dateTo: query.dateTo }, pairing);
}

async function listTripPaperIds(): Promise<{ pickups: string[]; receipts: string[] }> {
  const query = { workspaceId: WORKSPACE_A_ID, dateFrom: '2026-03-05', dateTo: '2026-03-05', plate: null, limit: 10 };
  const database = openWorkspaceA(databases.runtime);
  const [pickups, receipts] = await Promise.all([listTripPapers(database, query), listReceiptPapers(database, query)]);
  return { pickups: pickups.map((paper) => paper.id), receipts: receipts.map((paper) => paper.id) };
}

test('a drop-off-only entry does not link a paper without the drop-off company', async () => {
  await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'issuer', name: 'Gamma' }] });
  const entry = await insertEntry(databases.owner, { dropoff: 'Beta', wageVnd: 600000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('a drop-off-only entry links a paper that prints the drop-off company', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'receipt', parties: [{ role: 'customer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { dropoff: 'Beta', wageVnd: 600000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a two-word goods condition does not link goods that hold only its long word', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than cám' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Than đá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('a two-word goods condition links goods that hold both words', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Than đá loại 1' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Than đá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a short goods word does not match as a prefix', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Cát' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Cá' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), []);
});

test('a goods word of four or more letters matches as a prefix', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Clinker' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Clinke' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a goods text equal to the condition apart from spaces and accents links', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }], lines: [{ label: 'Hàng hóa', value: 'Đá1x2' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', goods: 'Đá 1x2' });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [ticket]);
});

test('a customer the admin names is saved as a result and does not limit the match', async () => {
  const ticket = await insertPaper(databases.owner, { stage: 'dispatch', parties: [{ role: 'issuer', name: 'Alpha' }] });
  const saved = JSON.parse(await callChatTool(databases.runtime, 'save_company_knowledge', {
    statement: 'Lấy hàng ở Alpha, khách hàng là Gamma',
    entry_id: null,
    when_goods: null,
    when_pickup_company: 'Alpha',
    when_dropoff_company: null,
    when_vehicle_plate: null,
    when_driver_member_id: null,
    then_customer: 'Gamma',
    then_dropoff: null,
    then_wage_vnd: null,
    then_rate_vnd_per_ton: null,
    then_allowance_vnd: null,
    then_note: null,
  })) as { entry_id: string };
  assert.deepEqual(await listLinkedPaperIds(databases.owner, saved.entry_id), [ticket]);
});

test('a pickup paper and a drop-off paper of one built trip add the wage once', async () => {
  const pickup = await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const dropOff = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [pickup, dropOff].sort());
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06')).amounts[0]?.sum, 700000);
});

test('two trips of one truck on one day add the wage twice', async () => {
  const papers = [
    await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 07:00:00', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 13:00:00', weightKg: 25000, parties: [{ role: 'issuer', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 10:00:00', weightKg: 26980, parties: [{ role: 'supplier', name: 'Alpha' }] }),
    await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-05', at: '2026-03-05 16:00:00', weightKg: 24990, parties: [{ role: 'supplier', name: 'Alpha' }] }),
  ];
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), papers.sort());
  const pairs = [{ pickup: 'p1', receipt: 'r1' }, { pickup: 'p2', receipt: 'r2' }];
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-05', new ScriptedPairingReader(pairs))).amounts[0]?.sum, 1400000);
});

test('a per-ton rate uses the weight of each built trip once', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  const entry = await insertEntry(databases.owner, { pickup: 'Alpha', ratePerTonVnd: 150000 });
  await linkEntry(databases.runtime, entry);
  assert.equal((await totalValue('Cước vận chuyển', '2026-03-05', '2026-03-06')).per_ton[0]?.amount, 4050000);
});

test('a drop-off-only entry that links only the receipt counts once for a paired trip', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  const receipt = await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'issuer', name: 'Beta' }] });
  const entry = await insertEntry(databases.owner, { dropoff: 'Beta', wageVnd: 700000 });
  await linkEntry(databases.runtime, entry);
  assert.deepEqual(await listLinkedPaperIds(databases.owner, entry), [receipt]);
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06')).amounts[0]?.sum, 700000);
});

test('two routes from one pickup company count the wage of each trip own drop-off', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C11111', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C11111', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'issuer', name: 'Beta' }] });
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C22222', date: '2026-03-05', weightKg: 25000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C22222', date: '2026-03-06', weightKg: 24950, parties: [{ role: 'issuer', name: 'Gamma' }] });
  for (const [dropoff, number] of [['Beta', 700000], ['Gamma', 800000]] as const) {
    await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', dropoff, wageVnd: number }));
  }
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06', new NamedDropOffReader())).amounts[0]?.sum, 1500000);
});

test('a trip picked up on the 31st and received on the 1st counts in the month of its pickup only', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-31', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-04-01', weightKg: 26950, parties: [{ role: 'supplier', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 700000 }));
  assert.equal((await totalValue('Lương tài xế', '2026-03-02', '2026-03-31')).amounts[0]?.sum, 700000);
  assert.equal((await totalValue('Lương tài xế', '2026-04-01', '2026-04-30')).amounts[0]?.sum ?? 0, 0);
});

test('a trip whose pickup paper prints Gamma does not take the Alpha entry that only its customer Beta links', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Gamma' }, { role: 'customer', name: 'Beta' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'issuer', name: 'Beta' }] });
  await insertAlphaAndGammaEntriesToBeta();
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06', new NamedDropOffReader())).amounts[0]?.sum, 900000);
});

test('a trip whose pickup paper prints Alpha still gets the Alpha entry', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Alpha' }, { role: 'customer', name: 'Beta' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'issuer', name: 'Beta' }] });
  await insertAlphaAndGammaEntriesToBeta();
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06', new NamedDropOffReader())).amounts[0]?.sum, 700000);
});

test('a trip picked up at Gamma gets no wage from an Alpha entry that only its Beta receipt links', async () => {
  await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: '2026-03-05', weightKg: 27000, parties: [{ role: 'issuer', name: 'Gamma' }] });
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', weightKg: 26950, parties: [{ role: 'issuer', name: 'Beta' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta', wageVnd: 700000 }));
  assert.equal((await totalValue('Lương tài xế', '2026-03-05', '2026-03-06', new NamedDropOffReader())).amounts[0]?.sum ?? 0, 0);
});

test('a receipt-only trip at Beta takes the newest entry', async () => {
  await insertPaper(databases.owner, { stage: 'receipt', plate: '51C12345', date: '2026-03-06', parties: [{ role: 'issuer', name: 'Beta' }] });
  await insertAlphaAndGammaEntriesToBeta();
  assert.equal((await totalValue('Lương tài xế', '2026-03-06', '2026-03-06', new NamedDropOffReader())).amounts[0]?.sum, 700000);
});

async function insertAlphaAndGammaEntriesToBeta(): Promise<void> {
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Gamma', dropoff: 'Beta', wageVnd: 900000 }));
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', dropoff: 'Beta', wageVnd: 700000 }));
}

const NO_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: null, template: null, date_meaning: null };

type Totals = { amounts: { sum: number }[]; per_ton: { amount: number }[] };

async function totalValue(valueName: string, dateFrom: string, dateTo: string, reader: RecordingReader | null = null): Promise<Totals> {
  const harness = createToolHarness(databases.runtime, reader === null ? {} : { dropOffReader: reader });
  const output = await harness.runTool('chat-gate', 'total_company_knowledge', { value_name: valueName, ...NO_FILTERS, date_from: dateFrom, date_to: dateTo, group_by: 'none' });
  return JSON.parse(output) as Totals;
}
