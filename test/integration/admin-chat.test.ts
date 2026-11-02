import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText } from '../fakes/fake-chat-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertChatMessage } from './message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

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
  });
});
