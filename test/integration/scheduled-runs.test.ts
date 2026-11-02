import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_MS = 60_000;

describe('the ticker runs the due scheduled tasks', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await database.query(`UPDATE channel_identities SET last_inbound_at = '${yesterday().toISOString()}'`);
  });

  afterEach(async () => {
    await harness.close();
  });

  function yesterday(): Date {
    return new Date(NOW.getTime() - 24 * 60 * 60_000);
  }

  function insertDueTask(task: Partial<NewScheduledTask> = {}): Promise<string> {
    const dueAt = new Date(NOW.getTime() - MINUTE_MS);
    return insertScheduledTask(database, {
      workspaceId,
      createdBy: duyUserId,
      status: 'active',
      runOnceAt: dueAt,
      nextRunAt: dueAt,
      ...task,
    });
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  it('sends the result of a due task to its creator', async () => {
    await insertDueTask();
    harness.chat.replyWith('Hôm nay Hùng gửi 3 mục.');

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Hôm nay Hùng gửi 3 mục.']]);
  });

  it("stores the result in the creator's chat with the task on its outbound row", async () => {
    const taskId = await insertDueTask();
    harness.chat.replyWith('Hôm nay Hùng gửi 3 mục.');

    await harness.runTick();

    expect(await database.query(`SELECT author, text, reply_to, reply_kind FROM messages WHERE workspace_id = '${workspaceId}'`)).toEqual([
      { author: 'bot', text: 'Hôm nay Hùng gửi 3 mục.', reply_to: null, reply_kind: null },
    ]);
    expect(await database.query('SELECT body, scheduled_task_id FROM outbound_messages')).toEqual([
      { body: 'Hôm nay Hùng gửi 3 mục.', scheduled_task_id: taskId },
    ]);
  });

  it('names the task and its creator in the run prompt', async () => {
    await insertDueTask({ title: 'Báo cáo hằng ngày' });

    await harness.runTick();

    expect(harness.chat.requests[0]?.system).toContain('Bạn đang chạy lịch tự động "Báo cáo hằng ngày" do quản lý Duy đặt.');
  });

  it("uses the task's instruction as the user turn", async () => {
    await insertDueTask({ instruction: 'Lập báo cáo.' });

    await harness.runTick();

    expect(harness.chat.requests[0]?.turns).toEqual([{ role: 'user', text: 'Lập báo cáo.', image: null }]);
  });

  it('does not run a task that is not yet due', async () => {
    await insertDueTask({ nextRunAt: new Date(NOW.getTime() + 10 * MINUTE_MS) });

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('never runs a draft', async () => {
    await insertDueTask({ status: 'draft', nextRunAt: null });

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('never runs a cancelled task', async () => {
    await insertDueTask({ status: 'cancelled', nextRunAt: null });

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('runs no task while chat is not configured and keeps its next run', async () => {
    const dueAt = new Date(NOW.getTime() - MINUTE_MS);
    await insertDueTask({ nextRunAt: dueAt });

    await harness.runTick({ chat: null });

    expect(harness.chat.requests).toEqual([]);
    expect(await database.query('SELECT next_run_at FROM scheduled_tasks')).toEqual([{ next_run_at: dueAt }]);
  });

  it('moves a daily task to tomorrow after it runs', async () => {
    harness.clock.setTo(new Date('2026-10-31T18:00:30+07:00'));
    await insertScheduledTask(database, {
      workspaceId,
      createdBy: duyUserId,
      status: 'active',
      nextRunAt: new Date('2026-10-31T18:00:00+07:00'),
    });

    await harness.runTick();

    expect(await database.query('SELECT next_run_at, last_run_at, locked_until FROM scheduled_tasks')).toEqual([
      { next_run_at: new Date('2026-11-01T18:00:00+07:00'), last_run_at: harness.clock.now(), locked_until: null },
    ]);
  });
});
