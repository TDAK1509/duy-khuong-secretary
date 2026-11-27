import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { answerAdminQuestion, playAdminTurn } from './support/admin-chat-session.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { buildImageKey, insertPhotoPaper, insertSentPhoto } from './support/photo-reply-rows.ts';
import { resetDatabase } from './support/reset-database.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';

const databases = openLeakDatabases();
const SHARED_PLATE = '51A00001';
const SHARED_DATE = '2026-03-02';
const QUESTION = 'phiếu này lưu thông tin gì?';

beforeEach(() => resetDatabase(databases.owner));

after(() => databases.close());

test("a question replying to one of four bot photos gets only that photo's paper", async () => {
  for (let index = 1; index <= 4; index += 1) {
    await insertPhotoPaper(databases.owner, { key: `shared-${index}`, plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(index) });
    await insertSentPhoto(databases.owner, { imageKey: buildImageKey(`shared-${index}`), zaloMessageId: `SENT-${index}` });
  }
  const request = await askAboutQuote(QUESTION, 'SENT-3');
  assert.equal(request.match(/<retrieved-data source="quoted-photo">/g)?.length, 1);
  assert.ok(request.includes(numberOf(3)));
  for (const other of [1, 2, 4]) assert.ok(!request.includes(numberOf(other)));
});

test("a question replying to the admin's own single photo gets that photo's paper", async () => {
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-1', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1), sentBy: 'admin' });
  await insertPhotoPaper(databases.owner, { key: 'other-paper', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(2) });
  const request = await askAboutQuote('ảnh này là phiếu gì?', 'INBOUND-1');
  assert.ok(request.includes(numberOf(1)));
  assert.ok(!request.includes(numberOf(2)));
});

test("a question replying to the second photo of an album gets only that photo's paper", async () => {
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-A1', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1), sentBy: 'admin', at: '2026-03-02 08:00:00+00' });
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-A2', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(2), sentBy: 'admin', at: '2026-03-02 08:00:01+00' });
  const request = await askAboutQuote('ảnh này là phiếu gì?', 'INBOUND-A2');
  assert.ok(request.includes(numberOf(2)));
  assert.ok(!request.includes(numberOf(1)));
});

test('a photo with two saved papers puts both papers in the block', async () => {
  const first = await insertPhotoPaper(databases.owner, { key: 'two-papers', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1) });
  await insertPhotoPaper(databases.owner, { key: 'two-papers-second', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(2), photoMessageId: first.photoMessageId, itemIndex: 1 });
  await insertSentPhoto(databases.owner, { imageKey: buildImageKey('two-papers'), zaloMessageId: 'SENT-4' });
  const request = await askAboutQuote(QUESTION, 'SENT-4');
  assert.ok(request.includes(`Giấy tờ 1 (id: ${first.paperId})`));
  assert.ok(request.includes('Giấy tờ 2 (id: '));
  assert.ok(request.includes(numberOf(1)));
  assert.ok(request.includes(numberOf(2)));
});

function numberOf(index: number): string {
  return `NUM-000${index}`;
}

async function askAboutQuote(text: string, quotedId?: string): Promise<string> {
  const model = new ScriptedChatModel([]);
  const played = await playAdminTurn({ owner: databases.owner, database: databases.runtime, chat: model, text, turnNumber: 1, quotedId }, answerAdminQuestion);
  if (played.crash !== null) throw played.crash;
  return readFirstRequestText(model);
}

function readFirstRequestText(model: ScriptedChatModel): string {
  const turn = model.requests[0]?.turns[0];
  if (turn?.role !== 'user' || turn.text === null) throw new Error('the model received no user turn');
  return turn.text;
}
