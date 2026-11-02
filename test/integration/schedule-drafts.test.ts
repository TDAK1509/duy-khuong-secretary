import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

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
});
