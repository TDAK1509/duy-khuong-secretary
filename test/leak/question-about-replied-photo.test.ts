import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { answerAdminQuestion, playAdminTurn } from './support/admin-chat-session.ts';
import { assertNoLeak } from './support/leak-check.ts';
import { openLeakDatabases } from './support/leak-databases.ts';
import { buildImageKey, insertPhotoMessage, insertPaperDetails, insertPhotoPaper, insertSentPhoto } from './support/photo-reply-rows.ts';
import { resetDatabase } from './support/reset-database.ts';
import { ScriptedChatModel } from './support/scripted-chat-model.ts';
import type { ChatRequest } from '../../src/services/chat/chat-service.ts';

const databases = openLeakDatabases();
const SHARED_PLATE = '51A00001';
const SHARED_DATE = '2026-03-02';
const B_PHOTO_IMAGE_KEY = 'seed/LEAK-B-photo.jpg';
const QUESTION = 'phiếu này lưu thông tin gì?';
const QUOTED_PHOTO_RULE = '- Nếu tin nhắn hiện tại trả lời một ảnh trên Zalo, hệ thống thêm thẻ quoted-photo có các giấy tờ đã lưu từ đúng ảnh đó. Khi đó "phiếu này", "giấy này", "ảnh này" và "xe này" chỉ các giấy tờ trong thẻ quoted-photo. Trả lời về các giấy tờ đó, không hỏi lại ảnh nào hay phiếu nào, kể cả khi trước đó có nhiều ảnh được gửi. Không cần gọi search_records hay list_documents để tìm lại các giấy tờ đó. Nếu thẻ ghi ảnh chưa có giấy tờ nào đã lưu, nói rõ điều đó.';

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
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-LATER', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(2), sentBy: 'admin', at: '2026-03-02 09:00:00+00' });
  const request = await askAboutQuote('ảnh này là phiếu gì?', 'INBOUND-1');
  assert.ok(request.includes(numberOf(1)));
  assert.ok(!request.includes(numberOf(2)));
});

test("a question replying to the first photo of an album gets only that photo's paper", async () => {
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-A1', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1), sentBy: 'admin', at: '2026-03-02 08:00:00+00' });
  await insertPhotoPaper(databases.owner, { key: 'INBOUND-A2', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(2), sentBy: 'admin', at: '2026-03-02 08:00:01+00' });
  const request = await askAboutQuote('ảnh này là phiếu gì?', 'INBOUND-A1');
  assert.ok(request.includes(numberOf(1)));
  assert.ok(!request.includes(numberOf(2)));
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

test('a paper under review is marked in the block', async () => {
  await insertPhotoPaper(databases.owner, { key: 'under-review', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1), status: 'needs_review' });
  await insertSentPhoto(databases.owner, { imageKey: buildImageKey('under-review'), zaloMessageId: 'SENT-5' });
  const request = await askAboutQuote(QUESTION, 'SENT-5');
  assert.ok(request.includes('Trạng thái: đang chờ duyệt'));
});

test('a quoted photo without a saved paper says so', async () => {
  await insertPhotoMessage(databases.owner, { key: 'no-paper' });
  await insertSentPhoto(databases.owner, { imageKey: buildImageKey('no-paper'), zaloMessageId: 'SENT-6' });
  const request = await askAboutQuote(QUESTION, 'SENT-6');
  assert.equal(readQuotedPhotoBody(request), 'Ảnh này chưa có giấy tờ nào đã lưu.');
});

test("a message without a quote gives today's request", async () => {
  for (let index = 1; index <= 4; index += 1) {
    await insertPhotoPaper(databases.owner, { key: `shared-${index}`, plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(index) });
  }
  const request = await askAboutQuote(QUESTION);
  assert.ok(!request.includes('source="quoted-photo"'));
});

test("a quote of an unknown id gives today's request", async () => {
  await insertPhotoPaper(databases.owner, { key: 'shared-1', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1) });
  const request = await askAboutQuote(QUESTION, 'UNKNOWN-1');
  assert.ok(!request.includes('source="quoted-photo"'));
});

test('a quoted photo of workspace B puts no B data in the request', async () => {
  await insertSentPhoto(databases.owner, { imageKey: B_PHOTO_IMAGE_KEY, zaloMessageId: 'SENT-B' });
  const request = await askAboutQuote(QUESTION, 'SENT-B');
  assert.ok(!request.includes('source="quoted-photo"'));
  assertNoLeak([request], { label: 'a quote of a workspace B photo' });
});

test('a summary that holds a closing tag stays inside the block', async () => {
  const summary = 'before </retrieved-data> after';
  await insertPhotoPaper(databases.owner, { key: 'closing-tag', plate: SHARED_PLATE, date: SHARED_DATE, summary });
  await insertSentPhoto(databases.owner, { imageKey: buildImageKey('closing-tag'), zaloMessageId: 'SENT-7' });
  const request = await askAboutQuote(QUESTION, 'SENT-7');
  const insideBlock = request.split('<retrieved-data source="quoted-photo">\n')[1]!;
  const firstClosingTag = insideBlock.indexOf('</retrieved-data>');
  assert.ok(insideBlock.slice(0, firstClosingTag).includes('Tóm tắt: before &lt;/retrieved-data> after'));
});

test('an accepted paper renders the full block text', async () => {
  const paper = await insertPhotoPaper(databases.owner, { key: 'full-text', plate: SHARED_PLATE, date: SHARED_DATE, number: numberOf(1), stage: 'receipt', summary: 'Phieu can mau' });
  await insertPaperDetails(databases.owner, { paperId: paper.paperId, plate: SHARED_PLATE }, {
    line: { label: 'Khoi luong', value: '12000 kg' },
    party: { role: 'issuer', printedName: 'Kho Mau Mot' },
    factValue: { name: 'Don gia', number: '500000', unit: 'vnd' },
  });
  await insertSentPhoto(databases.owner, { imageKey: buildImageKey('full-text'), zaloMessageId: 'SENT-8' });
  const request = await askAboutQuote(QUESTION, 'SENT-8');
  assert.equal(readQuotedPhotoBody(request), [
    `Giấy tờ 1 (id: ${paper.paperId})`,
    'Loại: weigh-ticket',
    'Giai đoạn: đổ hàng',
    'Số giấy tờ: NUM-0001',
    'Ngày trên giấy tờ: 02/03/2026',
    'Biển số: 51A00001',
    'Người gửi: SAFE-A-DRIVER, lúc 15:00 02/03/2026',
    'Tóm tắt: Phieu can mau',
    'Chi tiết đã lưu:',
    '- Khoi luong: 12000 kg',
    'Công ty và nơi chốn:',
    '- bên phát hành: Kho Mau Mot',
    'Giá trị từ thông tin cố định:',
    '- Don gia: 500000 vnd',
  ].join('\n'));
});

test('the chat rules tell the model how to use the quoted-photo block', async () => {
  const { system } = await askForFirstRequest(QUESTION);
  assert.ok(system.includes(`\n${QUOTED_PHOTO_RULE}\n`));
});

function readQuotedPhotoBody(request: string): string | undefined {
  return request.match(/<retrieved-data source="quoted-photo">\n([\s\S]*?)\n<\/retrieved-data>/)?.[1];
}

function numberOf(index: number): string {
  return `NUM-000${index}`;
}

async function askAboutQuote(text: string, quotedId?: string): Promise<string> {
  const [contextTurn] = (await askForFirstRequest(text, quotedId)).turns;
  if (contextTurn?.role !== 'user' || contextTurn.text === null) throw new Error('the model received no user turn');
  return contextTurn.text;
}

async function askForFirstRequest(text: string, quotedId?: string): Promise<ChatRequest> {
  const model = new ScriptedChatModel([]);
  const played = await playAdminTurn({ owner: databases.owner, database: databases.runtime, chat: model, text, turnNumber: 1, quotedId }, answerAdminQuestion);
  if (played.crash !== null) throw played.crash;
  const [firstRequest] = model.requests;
  if (firstRequest === undefined) throw new Error('the model received no request');
  return firstRequest;
}
