import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const NO_CHOICE_TEXT = 'Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.';
const CHECK_THE_DRAFT_TEXT = 'Bạn kiểm tra lại rồi trả lời 1 để lưu lịch nhé.';

type ProposalArguments = {
  title: string;
  instruction: string;
  repeat: 'once' | 'daily' | 'weekly' | 'monthly';
  run_once_at: string | null;
  time_of_day: string | null;
  weekday: number | null;
  day_of_month: number | null;
};

const DAILY_REPORT: ProposalArguments = {
  title: 'Báo cáo hằng ngày',
  instruction: 'Lập báo cáo.',
  repeat: 'daily',
  run_once_at: null,
  time_of_day: '18:00',
  weekday: null,
  day_of_month: null,
};

describe('an admin drafts a scheduled task by chat', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
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

  function proposeThenReply(proposal: Partial<ProposalArguments>, reply = CHECK_THE_DRAFT_TEXT): void {
    const call = { id: 'call_1', name: 'propose_scheduled_task', argumentsJson: JSON.stringify({ ...DAILY_REPORT, ...proposal }) };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText(reply)));
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  function findToolResult(): string {
    const turns = harness.chat.requests[1]?.turns ?? [];
    const result = turns.find((turn) => turn.role === 'tool_result');
    if (result?.role !== 'tool_result') throw new Error('the model received no tool result');
    return result.output;
  }

  it('stores a draft with no next run', async () => {
    proposeThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo hoạt động của tất cả tài xế');

    expect(
      await database.query(`SELECT workspace_id, created_by, title, status, next_run_at FROM scheduled_tasks`),
    ).toEqual([
      { workspace_id: workspaceId, created_by: duyUserId, title: 'Báo cáo hằng ngày', status: 'draft', next_run_at: null },
    ]);
  });

  it('tells the model the schedule and the first run', async () => {
    proposeThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(findToolResult()).toBe('{"ok":true,"draft":true,"schedule":"18:00 hằng ngày","first_run":"18:00 31/10/2026"}');
  });

  it('ends the answer with the card of the draft', async () => {
    proposeThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-duy',
        [
          CHECK_THE_DRAFT_TEXT,
          '',
          'Lịch mới: Báo cáo hằng ngày',
          'Chạy: 18:00 hằng ngày',
          'Lần chạy đầu: 18:00 31/10/2026',
          'Việc cần làm:',
          'Lập báo cáo.',
          'Lịch này chưa được lưu.',
          'Trả lời 1 để Lưu lịch "Báo cáo hằng ngày", 2 để Hủy.',
        ].join('\n'),
      ],
    ]);
  });

  it('stores the sent draft as the pending choice', async () => {
    proposeThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    const [task] = await database.query<{ id: string }>('SELECT id FROM scheduled_tasks');
    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: { kind: 'draft_confirm', task_id: task?.id, workspace_id: workspaceId } },
    ]);
  });

  it('confirms nothing with a 1 sent while the card is still queued', async () => {
    proposeThenReply({});
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    await harness.receiveText('zu-duy', '1');
    await harness.sendAllQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'draft' }]);
    expect(sentTexts().at(-1)).toEqual(['zu-duy', NO_CHOICE_TEXT]);
  });

  it('saves the draft and names it when the admin replies 1 after the card was sent', async () => {
    proposeThenReply({});
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(sentTexts().at(-1)).toEqual(['zu-duy', 'Đã lưu lịch "Báo cáo hằng ngày". Lần chạy đầu: 18:00 31/10/2026.']);
  });

  it('stores no choice for a card whose send ended unknown', async () => {
    proposeThenReply({});
    harness.channel.nextTextResult = { ok: false, reason: 'no_answer' };

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM outbound_messages')).toEqual([{ status: 'unknown' }]);
    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: null },
    ]);
  });

  it('stores no choice for a card sent after a newer message of the admin', async () => {
    proposeThenReply({});
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await insertInboundEvent(database, { externalUserId: 'zu-duy', text: 'chào' });

    await harness.sendQueuedTexts();

    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: null },
    ]);
  });

  it('cancels the older draft of the admin when a new one is proposed', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, title: 'Báo cáo cũ' });
    proposeThenReply({ title: 'Báo cáo mới' });

    await harness.receiveText('zu-duy', 'Đặt lịch báo cáo mới');

    expect(await database.query('SELECT title, status FROM scheduled_tasks ORDER BY title')).toEqual([
      { title: 'Báo cáo cũ', status: 'cancelled' },
      { title: 'Báo cáo mới', status: 'draft' },
    ]);
  });

  it('names the replaced draft on the first line of the card', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, title: 'Báo cáo cũ' });
    proposeThenReply({ title: 'Báo cáo mới' });

    await harness.receiveText('zu-duy', 'Đặt lịch báo cáo mới');
    await harness.sendQueuedTexts();

    const card = sentTexts()[0]?.[1]?.split('\n\n')[1];
    expect(card?.split('\n').slice(0, 2)).toEqual([
      'Lịch nháp trước "Báo cáo cũ" đã được thay bằng lịch này.',
      'Lịch mới: Báo cáo mới',
    ]);
  });

  it('refuses a one-time task in the past', async () => {
    proposeThenReply({ repeat: 'once', run_once_at: '2026-10-30 09:00', time_of_day: null });

    await harness.receiveText('zu-duy', 'Nhắc tôi vào 9 giờ hôm qua');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Thời điểm chạy đã qua."}');
  });

  it('refuses a daily task without a time', async () => {
    proposeThenReply({ time_of_day: null });

    await harness.receiveText('zu-duy', 'Mỗi ngày gửi tôi báo cáo');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Thiếu giờ chạy."}');
  });

  it('refuses the 21st task in a workspace', async () => {
    for (let number = 1; number <= 20; number += 1) {
      await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, title: `Lịch ${number}`, status: 'active' });
    }
    proposeThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(await database.query(`SELECT 1 FROM scheduled_tasks WHERE status = 'draft'`)).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Nhóm đã có 20 lịch. Xóa bớt lịch cũ trước."}');
  });

  it('refuses a title over 80 characters', async () => {
    proposeThenReply({ title: 'a'.repeat(81) });

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: title"}');
  });

  it('offers the three scheduling tools', async () => {
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    const toolNames = harness.chat.requests[0]?.tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(['propose_scheduled_task', 'list_scheduled_tasks', 'cancel_scheduled_task']));
  });

  it('puts the scheduling section in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(harness.chat.requests[0]?.system).toContain('Lịch tự động:');
  });

  it('stores a weekly draft and tells the model its weekday and first run', async () => {
    proposeThenReply({ repeat: 'weekly', weekday: 1, time_of_day: '07:00' });

    await harness.receiveText('zu-duy', 'Thứ Hai hằng tuần 7 giờ gửi tôi báo cáo');

    expect(await database.query('SELECT repeat, weekday, day_of_month FROM scheduled_tasks')).toEqual([
      { repeat: 'weekly', weekday: 1, day_of_month: null },
    ]);
    expect(findToolResult()).toBe('{"ok":true,"draft":true,"schedule":"07:00 Thứ Hai hằng tuần","first_run":"07:00 02/11/2026"}');
  });
});
