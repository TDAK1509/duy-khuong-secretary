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
});
