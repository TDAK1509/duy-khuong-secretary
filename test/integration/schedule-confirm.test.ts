import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

describe('an admin replies to the draft the bot showed', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
  });

  afterEach(async () => {
    await harness.close();
  });

  async function showDraft(task: Partial<NewScheduledTask> = {}): Promise<string> {
    const taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, ...task });
    await storeChoice(taskId, workspaceId);
    return taskId;
  }

  async function storeChoice(taskId: string, choiceWorkspaceId: string): Promise<void> {
    const choice = JSON.stringify({ kind: 'draft_confirm', task_id: taskId, workspace_id: choiceWorkspaceId });
    await database.query(`UPDATE channel_identities SET pending_choice = '${choice}'::jsonb WHERE external_user_id = 'zu-duy'`);
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  it('activates the shown draft with its next run', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', '1');

    expect(await database.query('SELECT status, next_run_at FROM scheduled_tasks')).toEqual([
      { status: 'active', next_run_at: new Date('2026-10-31T18:00:00+07:00') },
    ]);
  });

  it('sends the saved text with the first run', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Đã lưu lịch "Báo cáo hằng ngày". Lần chạy đầu: 18:00 31/10/2026.']]);
  });

  it('saves the draft when the admin replies with the words for save', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', 'Lưu lịch.');

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'active' }]);
  });

  it('cancels the shown draft and names it when the admin replies 2', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', '2');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'cancelled' }]);
    expect(sentTexts()).toEqual([['zu-duy', 'Đã hủy lịch nháp "Báo cáo hằng ngày".']]);
  });

  it('keeps a one-time draft whose time passed and says so', async () => {
    await showDraft({ runOnceAt: new Date('2026-10-31T09:00:00+07:00') });

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'draft' }]);
    expect(sentTexts()).toEqual([['zu-duy', 'Thời điểm chạy đã qua. Nhắn lại cho Trợ lý để đặt giờ khác.']]);
  });
});
