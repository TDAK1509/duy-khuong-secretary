import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertChatMessage } from './message-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

describe('an admin asks the bot', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    answerQuestionOnly();
  });

  afterEach(async () => {
    await harness.close();
  });

  function answerQuestionOnly(): void {
    const reading = makeReading([], { has_work_data: false, has_question: true });
    const pair: readonly [FakeReader, FakeReader] = harness.readers.cheap;
    pair.forEach((reader) => reader.answerWith(reading));
  }

  async function findUserId(displayName: string): Promise<string> {
    const [row] = await database.query<{ user_id: string }>(
      `SELECT user_id FROM memberships WHERE display_name = '${displayName}'`,
    );
    if (!row) throw new Error(`no member named ${displayName}`);
    return row.user_id;
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  it('gives an admin message without work data the answer of the chat model', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Chào anh']]);
  });

  it('stores the answer as a bot reply to the question', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(
      await database.query(`
        SELECT reply.text, reply.reply_kind, reply.reply_to = original.id AS replies_to_question
        FROM messages reply JOIN messages original ON original.author = 'user'
        WHERE reply.author = 'bot'`),
    ).toEqual([{ text: 'Chào anh', reply_kind: 'answer', replies_to_question: true }]);
  });

  it('carries the membership of the admin on the answer for the send-time check', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(
      await database.query(`
        SELECT outbound.admin_membership_id = membership.id AS carries_membership
        FROM outbound_messages outbound, memberships membership
        WHERE outbound.body = 'Chào anh' AND membership.display_name = 'Duy'`),
    ).toEqual([{ carries_membership: true }]);
  });

  it('names the workspace and the admin in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    const system = harness.chat.requests[0]?.system;
    expect(system).toContain('nhóm "Xe tải Duy Khương"');
    expect(system).toContain('Bạn đang trò chuyện với Duy, vai trò: quản lý');
  });

  it('puts the saving section in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(harness.chat.requests[0]?.system).toContain('Lưu dữ liệu:');
  });

  it('puts the search section in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(harness.chat.requests[0]?.system).toContain('Tìm dữ liệu:');
  });

  it('puts the admin block in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(harness.chat.requests[0]?.system).toContain('Người này là quản lý.');
  });

  it('offers the invite and removal tools', async () => {
    await harness.receiveText('zu-duy', 'Mời tài xế Hùng');

    const toolNames = harness.chat.requests[0]?.tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(['create_invite', 'remove_member']));
  });

  it('puts the invite instructions in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Mời tài xế Hùng');

    expect(harness.chat.requests[0]?.system).toContain('Để mời người mới vào nhóm, dùng create_invite.');
  });

  it('puts the removal instructions in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Xóa Hùng khỏi nhóm');

    expect(harness.chat.requests[0]?.system).toContain('Để xóa một người khỏi nhóm, dùng list_members để lấy id rồi gọi remove_member.');
  });

  it('keeps the person identifier out of the model input', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(JSON.stringify(harness.chat.requests)).not.toContain('zu-duy');
  });

  it('shows the model at most the last 20 messages of the chat', async () => {
    const duyUserId = await findUserId('Duy');
    for (let number = 1; number <= 30; number += 1) {
      await insertChatMessage(database, {
        workspaceId,
        userId: duyUserId,
        author: number % 2 === 0 ? 'bot' : 'user',
        text: `tin ${number}`,
        createdAt: new Date(Date.UTC(2026, 10, 2, 1, number)),
      });
    }

    await harness.receiveText('zu-duy', 'Hôm nay thế nào?');

    const turns = harness.chat.requests[0]?.turns ?? [];
    expect(turns).toHaveLength(21);
    expect(turns[0]).toEqual({ role: 'user', text: 'tin 11', image: null });
    expect(turns[20]).toEqual({ role: 'user', text: 'Hôm nay thế nào?', image: null });
  });

  it('never shows the model another person\'s messages', async () => {
    const khuongUserId = await insertMember(database, {
      workspaceId,
      externalUserId: 'zu-khuong',
      displayName: 'Khương',
      role: 'admin',
    });
    await insertChatMessage(database, {
      workspaceId,
      userId: khuongUserId,
      author: 'user',
      text: 'bí mật của Khương',
      createdAt: new Date('2026-11-01T10:00:00+07:00'),
    });

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(JSON.stringify(harness.chat.requests)).not.toContain('bí mật của Khương');
  });

  it('hides the old chat from an admin who was removed and invited again', async () => {
    const duyUserId = await findUserId('Duy');
    for (let number = 1; number <= 3; number += 1) {
      await insertChatMessage(database, {
        workspaceId,
        userId: duyUserId,
        author: 'user',
        text: `tin cũ ${number}`,
        createdAt: new Date(`2026-09-1${number}T10:00:00+07:00`),
      });
    }

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(harness.chat.requests[0]?.turns).toEqual([{ role: 'user', text: 'Chào bạn', image: null }]);
  });

  it('sends the new photo to the model as an image', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await harness.receivePhoto('zu-duy');

    const turns = harness.chat.requests[0]?.turns ?? [];
    const lastTurn = turns[turns.length - 1];
    expect(lastTurn).toMatchObject({ role: 'user', image: { contentType: 'image/jpeg' } });
  });

  it('sends older photos to the model as text', async () => {
    const duyUserId = await findUserId('Duy');
    await insertChatMessage(database, {
      workspaceId,
      userId: duyUserId,
      author: 'user',
      text: null,
      imageKey: `${workspaceId}/old.jpg`,
      createdAt: new Date('2026-11-01T10:00:00+07:00'),
    });

    await harness.receiveText('zu-duy', 'Còn gì nữa không?');

    const turns = harness.chat.requests[0]?.turns ?? [];
    expect(turns.some((turn) => turn.role === 'user' && turn.image !== null)).toBe(false);
    expect(turns[0]).toEqual({ role: 'user', text: '[ảnh]', image: null });
  });

  it('turns a chat-model failure into a friendly reply', async () => {
    harness.chat.failWith('unavailable');

    await harness.receiveText('zu-duy', 'Chào bạn');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Xin lỗi, hệ thống đang bận. Bạn gửi lại sau ít phút nhé.']]);
  });

  it('never sends a member\'s question to the chat model', async () => {
    await harness.receiveText('zu-hung', 'Hôm qua tôi gửi gì?');

    expect(harness.chat.requests).toEqual([]);
  });

  it('keeps an admin message waiting while chat is not configured', async () => {
    await insertInboundEvent(database, { externalUserId: 'zu-duy', text: 'Chào bạn' });

    await harness.runInbound({ chat: null });

    expect(await database.query('SELECT status, attempts FROM inbound_events')).toEqual([
      { status: 'queued', attempts: 0 },
    ]);
    expect(harness.readers.cheap[0].requests).toEqual([]);
  });

  it('stores no answer for an admin removed while the model answers', async () => {
    harness.chat.follow(async () => {
      await database.query(`DELETE FROM memberships WHERE display_name = 'Duy'`);
      return replyWithText('Chào anh');
    });

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toEqual([]);
    expect(await database.query(`SELECT 1 FROM outbound_messages WHERE body = 'Chào anh'`)).toEqual([]);
  });

  it('stores no answer for an admin removed and invited again as a member while the model answers', async () => {
    harness.chat.follow(async () => {
      const [{ user_id: userId } = { user_id: '' }] = await database.query<{ user_id: string }>(
        `DELETE FROM memberships WHERE display_name = 'Duy' RETURNING user_id`,
      );
      await insertMembership(database, { workspaceId, userId, displayName: 'Duy', role: 'member' });
      return replyWithText('Chào anh');
    });

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toEqual([]);
  });

  it('offers the three data tools first', async () => {
    await harness.receiveText('zu-duy', 'Nhóm có ai?');

    expect(harness.chat.requests[0]?.tools.map((tool) => tool.name).slice(0, 3)).toEqual(['search_records', 'count_records', 'list_members']);
  });

  describe('with tool calls', () => {
    const LIST_MEMBERS_CALL = { id: 'call_1', name: 'list_members', argumentsJson: '{}' };

    it('sends the tool result back to the model with its call id', async () => {
      harness.chat.follow((_request, callNumber) =>
        callNumber === 1 ? replyWithToolCalls(LIST_MEMBERS_CALL) : replyWithText('Nhóm có 3 người.'),
      );

      await harness.receiveText('zu-duy', 'Nhóm có ai?');

      const turns = harness.chat.requests[1]?.turns ?? [];
      expect(turns.slice(-2)).toMatchObject([
        { role: 'assistant_tool_calls', calls: [LIST_MEMBERS_CALL] },
        { role: 'tool_result', callId: 'call_1' },
      ]);
      expect(JSON.stringify(turns.at(-1))).toContain('Hùng');
    });

    it('turns the final text after a tool call into the answer', async () => {
      harness.chat.follow((_request, callNumber) =>
        callNumber === 1 ? replyWithToolCalls(LIST_MEMBERS_CALL) : replyWithText('Nhóm có 3 người.'),
      );

      await harness.receiveText('zu-duy', 'Nhóm có ai?');
      await harness.sendQueuedTexts();

      expect(sentTexts()).toEqual([['zu-duy', 'Nhóm có 3 người.']]);
    });

    it('answers the calls over the cap of one round with an error instead of running them', async () => {
      const calls = Array.from({ length: 8 }, (_, index) => ({ ...LIST_MEMBERS_CALL, id: `call_${index}` }));
      harness.chat.follow((_request, callNumber) =>
        callNumber === 1 ? replyWithToolCalls(...calls) : replyWithText('Xong'),
      );

      await harness.receiveText('zu-duy', 'Nhóm có ai?');

      const outputs = (harness.chat.requests[1]?.turns ?? []).flatMap((turn) => (turn.role === 'tool_result' ? [turn.output] : []));
      expect(outputs).toHaveLength(8);
      expect(outputs.filter((output) => output.includes('Hùng'))).toHaveLength(5);
      expect(outputs.slice(5)).toEqual(Array(3).fill('{"ok":false,"error":"Dữ liệu không hợp lệ: calls"}'));
    });

    it('stops after five rounds of tool calls', async () => {
      harness.chat.follow(() => replyWithToolCalls(LIST_MEMBERS_CALL));

      await harness.receiveText('zu-duy', 'Nhóm có ai?');
      await harness.sendQueuedTexts();

      expect(sentTexts()).toEqual([['zu-duy', 'Xin lỗi, tôi chưa xử lý được. Bạn thử lại nhé.']]);
      expect(harness.chat.requests).toHaveLength(6);
    });

    it('stores no answer built from tool results for an admin demoted during the answer', async () => {
      const hungUserId = await findUserId('Hùng');
      await insertRecordRow(database, {
        workspaceId,
        userId: hungUserId,
        senderName: 'Hùng',
        category: 'maintenance',
        maintenanceItem: 'lốp',
        identifiers: ['DT2024889'],
        summary: 'Bảo dưỡng: lốp, xe 29C12345, mã DT2024889',
      });
      const searchArguments = { text: 'DT2024-889', category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };
      harness.chat.follow(async (_request, callNumber) => {
        if (callNumber === 1) return replyWithToolCalls({ id: 'call_1', name: 'search_records', argumentsJson: JSON.stringify(searchArguments) });
        const [{ user_id: userId } = { user_id: '' }] = await database.query<{ user_id: string }>(
          `DELETE FROM memberships WHERE display_name = 'Duy' RETURNING user_id`,
        );
        await insertMembership(database, { workspaceId, userId, displayName: 'Duy', role: 'member' });
        return replyWithText('Bảo dưỡng: lốp, xe 29C12345, mã DT2024889');
      });

      await harness.receiveText('zu-duy', 'Lốp DT2024-889 thế nào?');

      expect(await database.query(`SELECT 1 FROM messages WHERE author = 'bot'`)).toEqual([]);
    });
  });

  describe('with data and a question', () => {
    beforeEach(() => {
      harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
      const reading = makeReading([makeFuelItem()], { has_question: true });
      harness.readers.cheap.forEach((reader) => reader.answerWith(reading));
    });

    function makeFuelItem() {
      return makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
    }

    it('commits the data before the chat model runs', async () => {
      let recordsSeenByModel = -1;
      harness.chat.follow(async () => {
        recordsSeenByModel = (await database.query('SELECT 1 FROM records')).length;
        return replyWithText('Hôm nay tổng 1.250.000đ.');
      });

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');

      expect(recordsSeenByModel).toBe(1);
    });

    it('sends the saved reply first', async () => {
      harness.chat.replyWith('Hôm nay tổng 1.250.000đ.');

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');
      await harness.sendAllQueuedTexts();

      expect(sentTexts()[0]).toEqual(['zu-duy', 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.']);
    });

    it('sends the answer of the chat model second', async () => {
      harness.chat.replyWith('Hôm nay tổng 1.250.000đ.');

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');
      await harness.sendAllQueuedTexts();

      expect(sentTexts()[1]).toEqual(['zu-duy', 'Hôm nay tổng 1.250.000đ.']);
    });

    it('lists the committed records in the system note', async () => {
      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');

      const turns = harness.chat.requests[0]?.turns ?? [];
      const lastTurn = turns[turns.length - 1];
      expect(lastTurn).toMatchObject({
        role: 'user',
        text: 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?\n\nHệ thống đã lưu:\n- Đổ xăng dầu, số 0001234 · 1.250.000đ · 30/10/2026',
      });
    });

    it('keeps the saved records when the chat model fails', async () => {
      harness.chat.failWith('unavailable');

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');

      expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
    });

    it('gives the failure text as the second reply when the chat model fails', async () => {
      harness.chat.failWith('unavailable');

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');
      await harness.sendAllQueuedTexts();

      expect(sentTexts()[1]).toEqual(['zu-duy', 'Xin lỗi, hệ thống đang bận. Bạn gửi lại sau ít phút nhé.']);
    });

    describe('when the worker stopped before the answer', () => {
      beforeEach(async () => {
        harness.chat.follow(() => {
          throw new Error('the worker stopped');
        });
        await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');
        await database.query(
          `UPDATE inbound_events SET status = 'processing', locked_until = '2026-11-01T00:00:00Z', attempts = 1`,
        );
        harness.chat.replyWith('Trả lời');
      });

      it('runs the chat model once for the owed answer', async () => {
        await harness.runInbound();

        expect(await database.query(`SELECT text FROM messages WHERE reply_kind = 'answer'`)).toEqual([
          { text: 'Trả lời' },
        ]);
      });

      it('does not read the photo again', async () => {
        const readsBefore = harness.readers.cheap[0].requests.length;

        await harness.runInbound();

        expect(harness.readers.cheap[0].requests).toHaveLength(readsBefore);
        expect(harness.readers.strong[0].requests).toHaveLength(0);
      });

      it('does not run the model for an admin who left the workspace of the message', async () => {
        const [{ user_id: userId } = { user_id: '' }] = await database.query<{ user_id: string }>(
          `DELETE FROM memberships WHERE display_name = 'Duy' RETURNING user_id`,
        );
        const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
        await insertMembership(database, { workspaceId: otherWorkspaceId, userId, displayName: 'Duy', role: 'admin' });
        await database.query(`UPDATE channel_identities SET current_workspace_id = '${otherWorkspaceId}' WHERE user_id = '${userId}'`);
        const callsBefore = harness.chat.requests.length;

        await harness.runInbound();

        expect(harness.chat.requests).toHaveLength(callsBefore);
        expect(await database.query(`SELECT 1 FROM messages WHERE reply_kind = 'answer'`)).toEqual([]);
      });
    });

    it('stores no answer when the worker lost its claim while the model answered', async () => {
      harness.chat.follow(async () => {
        await database.query(`UPDATE inbound_events SET attempts = attempts + 1`);
        return replyWithText('Trả lời');
      });

      await harness.receivePhoto('zu-duy', 'Lưu cái này rồi cho tôi biết hôm nay tổng bao nhiêu?');

      expect(await database.query(`SELECT 1 FROM messages WHERE reply_kind = 'answer'`)).toEqual([]);
      expect(await database.query(`SELECT question_pending FROM messages WHERE author = 'user'`)).toEqual([
        { question_pending: true },
      ]);
    });

    it('never sends an admin\'s data without a question to the chat model', async () => {
      const reading = makeReading([makeFuelItem()], { has_question: false });
      harness.readers.cheap.forEach((reader) => reader.answerWith(reading));

      await harness.receivePhoto('zu-duy');

      expect(harness.chat.requests).toEqual([]);
    });

    it('never sends an admin\'s unresolved message to the chat model', async () => {
      const first = makeReading([makeFuelItem()], { has_question: true });
      const second = makeReading([makeItem({ ...makeFuelItem(), amount_vnd: 1250001 })], { has_question: true });
      for (const [firstReader, secondReader] of [harness.readers.cheap, harness.readers.strong]) {
        firstReader.answerWith(first);
        secondReader.answerWith(second);
      }

      await harness.receivePhoto('zu-duy');

      expect(harness.chat.requests).toEqual([]);
    });

    it('never sends an admin\'s duplicate with a question to the chat model', async () => {
      await harness.receivePhoto('zu-hung');

      await harness.receivePhoto('zu-duy', 'Tổng hôm nay bao nhiêu?');

      expect(await database.query('SELECT 1 FROM records')).toHaveLength(1);
      expect(harness.chat.requests).toEqual([]);
    });
  });
});
