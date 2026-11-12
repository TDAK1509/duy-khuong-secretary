import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertChatMessage } from './message-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';

const FUEL_TEXT_WITH_QUESTION = 'Đổ dầu 500.000đ xe 29C-123.45. Tháng này tôi đổ mấy lần?';
const MEMBER_FUEL_SAVED_REPLY = 'Đã lưu: Đổ xăng dầu, xe 29C12345, 500.000đ, ngày 30/10/2026.';

describe('a member chats with the bot', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('gives a member greeting the answer of the chat model', async () => {
    harness.chat.replyWith('Chào bạn!');

    await harness.receiveText('zu-hung', 'Chào bạn');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', 'Chào bạn!']]);
  });

  it('offers the member the member tools and the memory tools', async () => {
    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(harness.chat.requests[0]?.tools.map((tool) => tool.name)).toEqual(['search_records', 'count_records', 'attach_photos', 'remember', 'forget', 'forget_all']);
  });

  it('sends the saved reply first and the chat answer second for a text with work and a question', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()], { has_question: true }));
    harness.chat.replyWith('Tháng này bạn đổ dầu 3 lần.');

    await harness.receiveText('zu-hung', FUEL_TEXT_WITH_QUESTION);
    await harness.sendAllQueuedTexts();

    expect(sentTexts()).toEqual([
      ['zu-hung', MEMBER_FUEL_SAVED_REPLY],
      ['zu-hung', 'Tháng này bạn đổ dầu 3 lần.'],
    ]);
  });

  it('answers a question left owed after a chat failure without a second record', async () => {
    harness.reader.answerWith(makeReading([makeFuelItem()], { has_question: true }));
    harness.chat.follow((_request, callNumber) => {
      if (callNumber === 1) throw new Error('the worker stopped');
      return replyWithText('Đây là câu trả lời.');
    });
    await harness.receiveText('zu-hung', FUEL_TEXT_WITH_QUESTION);
    await harness.database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '2026-11-01T00:00:00Z', attempts = 1`);

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect(sentTexts().filter(([, text]) => text === 'Đây là câu trả lời.')).toHaveLength(1);
  });

  it('answers a question with chat while an unclear photo waits and keeps the photo waiting', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
    harness.chat.replyWith('Tháng này bạn gửi 12 mục.');

    await harness.receiveText('zu-hung', 'Tháng này tôi gửi mấy mục?');
    await harness.sendAllQueuedTexts();

    expect(sentTexts().at(-1)).toEqual(['zu-hung', 'Tháng này bạn gửi 12 mục.']);
    expect(await harness.database.query(`SELECT submission_status FROM messages WHERE image_key IS NOT NULL`)).toEqual([
      { submission_status: 'needs_explanation' },
    ]);
  });

  it('answers the question in the explanation of an unclear photo after the saved reply', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    await harness.receivePhoto('zu-hung');
    harness.reader.answerWith(makeReading([makeFuelItem()], { has_question: true }));
    harness.chat.replyWith('Tháng này bạn đổ dầu 3 lần.');

    await harness.receiveText('zu-hung', FUEL_TEXT_WITH_QUESTION);
    await harness.sendAllQueuedTexts();

    expect(sentTexts().slice(-2)).toEqual([
      ['zu-hung', MEMBER_FUEL_SAVED_REPLY],
      ['zu-hung', 'Tháng này bạn đổ dầu 3 lần.'],
    ]);
  });

  it('keeps a member message waiting while chat is not configured', async () => {
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', text: 'Chào bạn' });

    await harness.runInbound({ chat: null });

    expect(await harness.database.query('SELECT status, attempts FROM inbound_events')).toEqual([{ status: 'queued', attempts: 0 }]);
    expect(harness.reader.requests).toEqual([]);
  });

  it('queues no answer for a member removed while the model answers', async () => {
    harness.chat.follow(async () => {
      await harness.database.query(`DELETE FROM memberships WHERE display_name = 'Hùng'`);
      return replyWithText('Chào bạn!');
    });

    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(await harness.database.query(`SELECT 1 FROM outbound_messages WHERE external_user_id = 'zu-hung'`)).toEqual([]);
  });

  it('queues the photo of a member answer without an admin membership', async () => {
    const recordId = await insertRecordRow(harness.database, {
      workspaceId: harness.workspaceId,
      userId: harness.hungUserId,
      senderName: 'Hùng',
      imageKey: 'hung/phieu-dau.jpg',
    });
    harness.chat.follow((_request, callNumber) =>
      callNumber === 1
        ? replyWithToolCalls({ id: 'call_1', name: 'attach_photos', argumentsJson: JSON.stringify({ record_ids: [recordId] }) })
        : replyWithText('Đây là ảnh phiếu dầu.'),
    );

    await harness.receiveText('zu-hung', 'Gửi lại ảnh phiếu dầu');

    expect(await harness.database.query(`SELECT kind, photo_key, admin_membership_id FROM outbound_messages ORDER BY kind`)).toEqual([
      { kind: 'image', photo_key: 'hung/phieu-dau.jpg', admin_membership_id: null },
      { kind: 'text', photo_key: null, admin_membership_id: null },
    ]);
  });

  it('shows the model the earlier answer of the bot with its text', async () => {
    const userId = harness.hungUserId;
    const { workspaceId, database } = harness;
    await insertChatMessage(database, { workspaceId, userId, author: 'user', text: 'Chào bạn', createdAt: new Date('2026-11-02T09:00:00+07:00') });
    await insertChatMessage(database, { workspaceId, userId, author: 'bot', text: 'Chào bạn!', holdsOtherText: true, createdAt: new Date('2026-11-02T09:00:01+07:00') });

    await harness.receiveText('zu-hung', 'Bạn khỏe không?');

    expect(harness.chat.requests[0]?.turns).toEqual([
      { role: 'user', text: 'Chào bạn' },
      { role: 'assistant', text: 'Chào bạn!' },
      { role: 'user', text: 'Bạn khỏe không?' },
    ]);
  });

  it('stores the answer to a member as holding text from others', async () => {
    harness.chat.replyWith('Chào bạn!');

    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(await harness.database.query(`SELECT holds_other_text FROM messages WHERE reply_kind = 'answer'`)).toEqual([
      { holds_other_text: true },
    ]);
  });

  it('gives the member the member prompt', async () => {
    await harness.receiveText('zu-hung', 'Chào bạn');

    const system = harness.chat.requests[0]?.system;
    expect(system).toContain('Bạn đang trò chuyện với Hùng, vai trò: thành viên.');
    expect(system).not.toContain('create_invite');
  });

  function makeFuelItem() {
    return makeItem({ category: 'đổ xăng dầu', amount_vnd: 500000, occurred_on: '2026-10-30', vehicle_plate: '29C-123.45' });
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }
});
