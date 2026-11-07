import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';
import { createIntakeHarness, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const MINUTE_MS = 60_000;
const SEARCH_EVERYTHING = JSON.stringify({
  text: null,
  category: null,
  member: null,
  plate: null,
  added_from: null,
  added_to: null,
  cursor: null,
});

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

  it('writes no admin-chat line for a due task', async () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    await insertDueTask();
    harness.chat.replyWith('Hôm nay Hùng gửi 3 mục.');

    await harness.runTick();

    const lines = logged.mock.calls.map(([line]) => String(line));
    logged.mockRestore();
    expect(lines.filter((line) => line.startsWith('[admin-chat]'))).toEqual([]);
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

    expect(harness.chat.requests[0]?.turns).toEqual([{ role: 'user', text: 'Lập báo cáo.' }]);
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

  it('runs a one-time task once', async () => {
    await insertDueTask();

    await harness.runTick();
    await harness.runTick();

    expect(await database.query('SELECT count(*)::int AS count FROM messages')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT next_run_at FROM scheduled_tasks')).toEqual([{ next_run_at: null }]);
  });

  it('sends once when two ticks start at the same moment', async () => {
    await insertDueTask();
    const firstAnswer = holdFirstAnswer();
    const firstTick = harness.runTick();
    try {
      await firstAnswer.started;
      await harness.runTick();
    } finally {
      firstAnswer.release();
      await firstTick;
    }

    expect(await database.query('SELECT count(*)::int AS count FROM messages')).toEqual([{ count: 1 }]);
  });

  it('claims a task again once its lock expired and sends once', async () => {
    await insertDueTask({ lockedUntil: new Date(NOW.getTime() - MINUTE_MS) });

    await harness.runTick();

    expect(await database.query('SELECT count(*)::int AS count FROM messages')).toEqual([{ count: 1 }]);
  });

  it('does not claim a task while its lock holds', async () => {
    await insertDueTask({ lockedUntil: new Date(NOW.getTime() + MINUTE_MS) });

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it("sends nothing when a stale runner's lock expired and another runner finished the task", async () => {
    await insertDueTask({ runOnceAt: undefined });
    const staleAnswer = holdFirstAnswer();
    const staleTick = harness.runTick();
    try {
      await staleAnswer.started;
      harness.clock.advanceBy(11 * MINUTE_MS);
      await harness.runTick();
    } finally {
      staleAnswer.release();
      await staleTick;
    }

    expect(await database.query('SELECT text FROM messages')).toEqual([{ text: 'Báo cáo của runner B' }]);
  });

  it('sends nothing when the run has nothing to report', async () => {
    await insertDueTask();
    harness.chat.replyWith(' KHONG_CO_THONG_BAO ');

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  function holdFirstAnswer(): { started: Promise<void>; release: () => void } {
    let release = (): void => {};
    let markStarted = (): void => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    harness.chat.follow(async (_request, callNumber) => {
      if (callNumber === 1) {
        markStarted();
        await gate;
      }
      return replyWithText(callNumber === 1 ? 'Báo cáo của runner A' : 'Báo cáo của runner B');
    });
    return { started, release };
  }

  async function searchEverythingDuringRun(): Promise<string[]> {
    harness.chat.follow(async (_request, callNumber) =>
      callNumber === 1 ? replyWithToolCalls({ id: 'call_1', name: 'search_records', argumentsJson: SEARCH_EVERYTHING }) : replyWithText('Xong'),
    );
    await harness.runTick();
    return readFoundRecordIds();
  }

  function readFoundRecordIds(): string[] {
    const toolResult = harness.chat.requests[1]?.turns.find((turn) => turn.role === 'tool_result');
    if (toolResult?.role !== 'tool_result') throw new Error('the run never received a tool result');
    return (JSON.parse(toolResult.output) as { items: { id: string }[] }).items.map((item) => item.id);
  }

  it('lets the run see the whole workspace', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const hungRecordId = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng' });
    const lanRecordId = await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan' });
    await insertDueTask();

    expect((await searchEverythingDuringRun()).sort()).toEqual([hungRecordId, lanRecordId].sort());
  });

  it('never lets the run see another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Vy');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vyUserId, senderName: 'Vy' });
    await insertDueTask();

    expect(await searchEverythingDuringRun()).toEqual([]);
  });

  it('turns off a task whose creator was removed and invited again as a member', async () => {
    await insertDueTask();
    await database.query(`DELETE FROM memberships WHERE user_id = '${duyUserId}'`);
    await insertMembership(database, { workspaceId, userId: duyUserId, displayName: 'Duy', role: 'member' });

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
    expect(await database.query('SELECT status, next_run_at, locked_until FROM scheduled_tasks')).toEqual([
      { status: 'cancelled', next_run_at: null, locked_until: null },
    ]);
  });

  it('turns off a task whose creator was removed', async () => {
    await insertDueTask();
    await database.query(`DELETE FROM memberships WHERE user_id = '${duyUserId}'`);

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'cancelled' }]);
  });

  it('offers exactly the four read tools', async () => {
    await insertDueTask();

    await harness.runTick();

    expect(harness.chat.requests[0]?.tools.map((tool) => tool.name)).toEqual([
      'search_records',
      'count_records',
      'maintenance_status',
      'list_members',
    ]);
  });

  it('refuses a tool the run was not offered', async () => {
    await insertDueTask();
    harness.chat.follow(async (_request, callNumber) =>
      callNumber === 1
        ? replyWithToolCalls({ id: 'call_1', name: 'remove_member', argumentsJson: JSON.stringify({ member_id: harness.hungUserId }) })
        : replyWithText('Xong'),
    );

    await harness.runTick();

    const toolResult = harness.chat.requests[1]?.turns.find((turn) => turn.role === 'tool_result');
    expect(toolResult).toMatchObject({ output: '{"ok":false,"error":"Dữ liệu không hợp lệ: name"}' });
    expect(await database.query('SELECT 1 FROM memberships')).toHaveLength(2);
  });

  it('stores and queues nothing for a creator removed during the run', async () => {
    await insertDueTask();
    harness.chat.follow(async () => {
      await database.query(`DELETE FROM memberships WHERE user_id = '${duyUserId}'`);
      return replyWithText('Báo cáo');
    });

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'cancelled' }]);
  });

  it('stores and queues nothing for a creator removed and invited again as a member during the run', async () => {
    await insertDueTask();
    harness.chat.follow(async () => {
      await database.query(`DELETE FROM memberships WHERE user_id = '${duyUserId}'`);
      await insertMembership(database, { workspaceId, userId: duyUserId, displayName: 'Duy', role: 'member' });
      return replyWithText('Báo cáo');
    });

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM messages')).toEqual([]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('sends a failure note when the model fails', async () => {
    await insertDueTask({ title: 'Báo cáo hằng ngày' });
    harness.chat.failWith('unavailable');

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Lịch "Báo cáo hằng ngày" chạy lỗi. Lần chạy sau sẽ thử lại.']]);
  });

  it('runs at most five due tasks in one tick and leaves the rest due for the next tick', async () => {
    for (let number = 0; number < 7; number += 1) await insertDueTask({ title: `Lịch ${number}` });

    await harness.runTick();

    expect(harness.chat.requests).toHaveLength(5);
    await harness.runTick();
    expect(harness.chat.requests).toHaveLength(7);
  });
});
