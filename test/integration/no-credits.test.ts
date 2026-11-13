import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCallsUsing } from '../fakes/fake-chat-service.ts';
import { CHAT_ROUND_USAGE, PHOTO_READ_USAGE, TEXT_READ_USAGE } from '../fakes/sample-usage.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { readCreditBalance, setCreditBalance } from './llm-call-rows.ts';
import { insertMember } from './workspace-rows.ts';

const OUT_OF_CREDIT_TEXT =
  'Nhóm của bạn đã hết credit nên Trợ lý chưa đọc tin nhắn này. Quản lý nhóm cần liên hệ bên cung cấp Trợ lý để nạp thêm credit. Sau khi nạp, bạn gửi lại tin nhắn này nhé.';

const OUT_OF_CREDIT_NOTICE =
  'Nhóm "Xe tải Duy Khương" đã hết credit. Từ bây giờ, Trợ lý không đọc ảnh, không trả lời tin nhắn và không chạy lịch của nhóm. Trợ lý vẫn giữ ảnh và tin nhắn mọi người gửi. Bạn liên hệ bên cung cấp Trợ lý để nạp thêm credit.';

describe('a workspace with no credits', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await setCreditBalance(harness.database, harness.workspaceId, 0);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stores the photo of a member without reading it and tells the member', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', externalEventId: 'zmsg-photo', kind: 'images', imageUrls: [PHOTO_URL] });

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toEqual([]);
    expect(await harness.database.query("SELECT author, submission_status FROM messages WHERE image_key IS NOT NULL")).toEqual([
      { author: 'user', submission_status: 'pending' },
    ]);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT, quoteMessageId: 'zmsg-photo' }]);
  });

  it('stores the text of a member without reading it and tells the member', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toEqual([]);
    expect(await harness.database.query('SELECT author, text, submission_status FROM messages')).toEqual([
      { author: 'user', text: 'Đổ dầu 500.000đ', submission_status: 'pending' },
    ]);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT }]);
  });

  it('calls no LLM for the question of an admin when the balance is below zero', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await setCreditBalance(harness.database, harness.workspaceId, -5);

    await harness.receiveText('zu-duy', 'Hôm nay ai gửi gì?');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toEqual([]);
    expect(harness.chat.requests).toEqual([]);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT, to: { externalUserId: 'zu-duy' } }]);
  });

  it('gives one message for three photos sent in one event', async () => {
    const photoUrls = ['https://z.test/1.jpg', 'https://z.test/2.jpg', 'https://z.test/3.jpg'];
    for (const [index, url] of photoUrls.entries()) harness.channel.attachments.set(url, { ok: true, bytes: makeJpeg(1000 + index) });
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: photoUrls });

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(await harness.database.query('SELECT 1 FROM messages WHERE image_key IS NOT NULL')).toHaveLength(3);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT }]);
  });

  it('does not read the photo that waits for an explanation', async () => {
    await setCreditBalance(harness.database, harness.workspaceId, 20000);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    await setCreditBalance(harness.database, harness.workspaceId, 0);
    harness.reader.requests.length = 0;

    await harness.receiveText('zu-hung', 'Lốp mới thay cho xe 29C-123.45');

    expect(harness.reader.requests).toEqual([]);
    expect(await harness.database.query("SELECT submission_status FROM messages WHERE image_key IS NOT NULL")).toEqual([
      { submission_status: 'needs_explanation' },
    ]);
  });
});

describe('a workspace that runs out of credits during an action', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it('still reads the photo and goes below zero', async () => {
    await setCreditBalance(harness.database, harness.workspaceId, 10);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([makeItem()]), PHOTO_READ_USAGE);

    await harness.receivePhoto('zu-hung');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toHaveLength(1);
    expect(harness.channel.texts.map((text) => text.to.externalUserId)).toContain('zu-hung');
    expect(await readCreditBalance(harness.database, harness.workspaceId)).toBe('-29.600');
  });

  it('finishes all the chat rounds of an action that starts with credits', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await setCreditBalance(harness.database, harness.workspaceId, 1);
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
    const listMembers = { id: 'call_1', name: 'list_members', argumentsJson: '{}' };
    harness.chat.follow((_request, callNumber) =>
      callNumber === 1 ? replyWithToolCallsUsing(CHAT_ROUND_USAGE, listMembers) : replyWithText('Nhóm có 2 người.', CHAT_ROUND_USAGE),
    );

    await harness.receiveText('zu-duy', 'Nhóm có mấy người?');
    await harness.sendAllQueuedTexts();

    expect(harness.chat.requests).toHaveLength(2);
    expect(harness.channel.texts.map((text) => text.text)).toContain('Nhóm có 2 người.');
  });

  it('tells each admin once when a charge takes the balance to zero or below', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await setCreditBalance(harness.database, harness.workspaceId, 10);
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([makeItem()]), PHOTO_READ_USAGE);

    await harness.receivePhoto('zu-hung');

    expect(await listNoticesTo('zu-duy')).toEqual([{ body: OUT_OF_CREDIT_NOTICE, requires_open_window: true }]);
  });

  it('sends no second notice for a charge that starts below zero', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await setCreditBalance(harness.database, harness.workspaceId, 10);
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }), TEXT_READ_USAGE);
    harness.chat.replyWith('Chào anh', CHAT_ROUND_USAGE);

    await harness.receiveText('zu-duy', 'Hôm nay ai gửi gì?');

    expect(await readCreditBalance(harness.database, harness.workspaceId)).toBe('-5.300');
    expect(await listNoticesTo('zu-duy')).toHaveLength(1);
  });

  function listNoticesTo(externalUserId: string): Promise<{ body: string; requires_open_window: boolean }[]> {
    return harness.database.query(
      `SELECT body, requires_open_window FROM outbound_messages
       WHERE external_user_id = '${externalUserId}' AND body LIKE '%hết credit%'`,
    );
  }
});
