import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const SAVED_TEXT = 'Đã đặt lịch.';
const NO_CHOICE_TEXT = 'Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.';

type TaskArguments = {
  title: string;
  instruction: string;
  repeat: 'once' | 'daily' | 'weekly' | 'monthly';
  run_once_at: string | null;
  time_of_day: string | null;
  weekday: number | null;
  day_of_month: number | null;
  maintenance_rules: { maintenance_item: string; age_days: number }[];
};

const DAILY_REPORT: TaskArguments = {
  title: 'Báo cáo hằng ngày',
  instruction: 'Lập báo cáo.',
  repeat: 'daily',
  run_once_at: null,
  time_of_day: '18:00',
  weekday: null,
  day_of_month: null,
  maintenance_rules: [],
};

describe('an admin creates a scheduled task by chat', () => {
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

  function createThenReply(proposal: Partial<TaskArguments>, reply = SAVED_TEXT): void {
    const call = { id: 'call_1', name: 'create_scheduled_task', argumentsJson: JSON.stringify({ ...DAILY_REPORT, ...proposal }) };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText(reply)));
  }

  async function receiveCreateRequest(): Promise<string> {
    createThenReply({});
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo hoạt động của tất cả tài xế');
    const [message] = await database.query<{ id: string }>(`SELECT id FROM messages WHERE reply_to IS NULL`);
    if (!message) throw new Error('the message was not stored');
    return message.id;
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

  it('creates an active task at once', async () => {
    const messageId = await receiveCreateRequest();

    expect(
      await database.query(`SELECT workspace_id, created_by, title, status, next_run_at, creation_key FROM scheduled_tasks`),
    ).toEqual([
      {
        workspace_id: workspaceId,
        created_by: duyUserId,
        title: 'Báo cáo hằng ngày',
        status: 'active',
        next_run_at: new Date('2026-10-31T18:00:00+07:00'),
        creation_key: `${messageId}:1`,
      },
    ]);
  });

  it('tells the model the task is saved with its schedule and first run', async () => {
    createThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(findToolResult()).toBe('{"ok":true,"saved":true,"schedule":"18:00 hằng ngày","first_run":"18:00 31/10/2026"}');
  });

  it('creates one task when the message is processed again after the worker stopped', async () => {
    const call = { id: 'call_1', name: 'create_scheduled_task', argumentsJson: JSON.stringify(DAILY_REPORT) };
    harness.chat.follow((_request, callNumber) => {
      if (callNumber === 2) throw new Error('the worker stopped');
      return callNumber % 2 === 1 ? replyWithToolCalls(call) : replyWithText(SAVED_TEXT);
    });
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await database.query(`UPDATE inbound_events SET status = 'processing', locked_until = '2026-10-30T00:00:00Z', attempts = 1`);

    await harness.runInbound();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'active' }]);
    expect(await database.query(`SELECT 1 FROM messages WHERE reply_kind = 'answer'`)).toHaveLength(1);
  });

  it('ends the answer with the summary of the new task', async () => {
    createThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([
      [
        'zu-duy',
        [
          SAVED_TEXT,
          '',
          'Đã đặt lịch "Báo cáo hằng ngày".',
          'Chạy: 18:00 hằng ngày',
          'Lần chạy đầu: 18:00 31/10/2026',
          'Việc cần làm: Lập báo cáo.',
          'Muốn hủy lịch này, nhắn: Hủy lịch "Báo cáo hằng ngày"',
        ].join('\n'),
      ],
    ]);
  });

  it('cuts a long instruction in the summary to its first 200 characters', async () => {
    const instruction = 'Việc '.repeat(100);
    createThenReply({ instruction });

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    const line = sentTexts()[0]?.[1]?.split('\n').find((text) => text.startsWith('Việc cần làm:'));
    expect(line).toBe(`Việc cần làm: ${instruction.slice(0, 200)}…`);
  });

  it('gives one summary per task in creation order, separated by a blank line', async () => {
    const calls = ['Báo cáo hằng ngày', 'Báo cáo tuần'].map((title, index) => ({
      id: `call_${index + 1}`,
      name: 'create_scheduled_task',
      argumentsJson: JSON.stringify({ ...DAILY_REPORT, title }),
    }));
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(...calls) : replyWithText(SAVED_TEXT)));

    await harness.receiveText('zu-duy', 'Đặt hai lịch báo cáo');
    await harness.sendQueuedTexts();

    const paragraphs = sentTexts()[0]?.[1]?.split('\n\n') ?? [];
    expect(paragraphs.map((paragraph) => paragraph.split('\n')[0])).toEqual([
      SAVED_TEXT,
      'Đã đặt lịch "Báo cáo hằng ngày".',
      'Đã đặt lịch "Báo cáo tuần".',
    ]);
  });

  it('offers no choice with the summary', async () => {
    createThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT offered_choice FROM outbound_messages')).toEqual([{ offered_choice: null }]);
    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: null },
    ]);
  });

  it('changes no task when the admin replies 1 to the summary', async () => {
    createThenReply({});
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');
    await harness.sendQueuedTexts();

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'active' }]);
    expect(sentTexts().at(-1)).toEqual(['zu-duy', NO_CHOICE_TEXT]);
  });

  it('refuses a one-time task in the past', async () => {
    createThenReply({ repeat: 'once', run_once_at: '2026-10-30 09:00', time_of_day: null });

    await harness.receiveText('zu-duy', 'Nhắc tôi vào 9 giờ hôm qua');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Thời điểm chạy đã qua."}');
  });

  it('refuses a daily task without a time', async () => {
    createThenReply({ time_of_day: null });

    await harness.receiveText('zu-duy', 'Mỗi ngày gửi tôi báo cáo');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Thiếu giờ chạy."}');
  });

  it('refuses the 21st task in a workspace', async () => {
    for (let number = 1; number <= 20; number += 1) {
      await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, title: `Lịch ${number}`, status: 'active' });
    }
    createThenReply({});

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(await database.query(`SELECT 1 FROM scheduled_tasks`)).toHaveLength(20);
    expect(findToolResult()).toBe('{"ok":false,"error":"Nhóm đã có 20 lịch. Xóa bớt lịch cũ trước."}');
  });

  it('refuses a title over 80 characters', async () => {
    createThenReply({ title: 'a'.repeat(81) });

    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe('{"ok":false,"error":"Dữ liệu không hợp lệ: title"}');
  });

  it('offers the three scheduling tools', async () => {
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    const toolNames = harness.chat.requests[0]?.tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(['create_scheduled_task', 'list_scheduled_tasks', 'cancel_scheduled_task']));
  });

  it('puts the scheduling section in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Mỗi ngày 18 giờ gửi tôi báo cáo');

    expect(harness.chat.requests[0]?.system).toContain('Lịch tự động:');
  });

  it('stores a weekly task and tells the model its weekday and first run', async () => {
    createThenReply({ repeat: 'weekly', weekday: 1, time_of_day: '07:00' });

    await harness.receiveText('zu-duy', 'Thứ Hai hằng tuần 7 giờ gửi tôi báo cáo');

    expect(await database.query('SELECT repeat, weekday, day_of_month FROM scheduled_tasks')).toEqual([
      { repeat: 'weekly', weekday: 1, day_of_month: null },
    ]);
    expect(findToolResult()).toBe('{"ok":true,"saved":true,"schedule":"07:00 Thứ Hai hằng tuần","first_run":"07:00 02/11/2026"}');
  });

  it('stores a monthly task and tells the model its day and first run', async () => {
    createThenReply({ repeat: 'monthly', day_of_month: 5, time_of_day: '08:00' });

    await harness.receiveText('zu-duy', 'Ngày 5 hằng tháng 8 giờ gửi tôi báo cáo');

    expect(await database.query('SELECT repeat, weekday, day_of_month FROM scheduled_tasks')).toEqual([
      { repeat: 'monthly', weekday: null, day_of_month: 5 },
    ]);
    expect(findToolResult()).toBe('{"ok":true,"saved":true,"schedule":"08:00 ngày 5 hằng tháng","first_run":"08:00 05/11/2026"}');
  });

  it('stores a one-time task that is still ahead', async () => {
    createThenReply({ repeat: 'once', run_once_at: '2026-10-31 15:30', time_of_day: null });

    await harness.receiveText('zu-duy', 'Nhắc tôi lúc 15 giờ 30');

    expect(findToolResult()).toBe('{"ok":true,"saved":true,"schedule":"15:30 31/10/2026 (một lần)","first_run":"15:30 31/10/2026"}');
  });

  it.each([
    ['a weekly task without a weekday', { repeat: 'weekly', time_of_day: '07:00' }, 'weekday'],
    ['a weekday after Sunday', { repeat: 'weekly', time_of_day: '07:00', weekday: 8 }, 'weekday'],
    ['a monthly task on day 29', { repeat: 'monthly', time_of_day: '07:00', day_of_month: 29 }, 'day_of_month'],
    ['a daily task with a weekday', { weekday: 1 }, 'weekday'],
    ['a one-time task with a time of day', { repeat: 'once', run_once_at: '2026-11-01 09:00', time_of_day: '09:00' }, 'time_of_day'],
    ['a time of day that is not HH:mm', { time_of_day: '6 giờ chiều' }, 'time_of_day'],
    ['a one-time date that does not exist', { repeat: 'once', run_once_at: '2026-02-30 09:00', time_of_day: null }, 'run_once_at'],
    ['an empty instruction', { instruction: '  ' }, 'instruction'],
    ['an instruction over 2000 characters', { instruction: 'a'.repeat(2001) }, 'instruction'],
  ] as const)('refuses %s', async (_description, proposal, field) => {
    createThenReply(proposal);

    await harness.receiveText('zu-duy', 'Đặt lịch');

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
    expect(findToolResult()).toBe(`{"ok":false,"error":"Dữ liệu không hợp lệ: ${field}"}`);
  });

  it('adds nothing to the answer when the task was cancelled in the same turn', async () => {
    const create = { id: 'call_1', name: 'create_scheduled_task', argumentsJson: JSON.stringify(DAILY_REPORT) };
    harness.chat.follow(async (_request, callNumber) => {
      if (callNumber === 1) return replyWithToolCalls(create);
      const [task] = await database.query<{ id: string }>('SELECT id FROM scheduled_tasks');
      const cancel = { id: 'call_2', name: 'cancel_scheduled_task', argumentsJson: JSON.stringify({ task_id: task?.id }) };
      return callNumber === 2 ? replyWithToolCalls(cancel) : replyWithText('Đã hủy.');
    });

    await harness.receiveText('zu-duy', 'Đặt rồi hủy lịch');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Đã hủy.']]);
    expect(await database.query(`SELECT pending_choice FROM channel_identities WHERE external_user_id = 'zu-duy'`)).toEqual([
      { pending_choice: null },
    ]);
  });
});
