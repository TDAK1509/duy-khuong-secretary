import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertMembership, insertWorkspace } from './workspace-rows.ts';

const NO_CHOICE_TEXT = 'Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.';

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

  it('never sends a confirm reply to the readers', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', '1');

    expect(harness.readers.cheap[0].requests).toEqual([]);
    expect(harness.chat.requests).toEqual([]);
  });

  it('confirms nothing with a 1 sent after another message', async () => {
    await showDraft();
    await harness.receiveText('zu-duy', 'chào');

    await harness.receiveText('zu-duy', '1');
    await harness.sendAllQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'draft' }]);
    expect(sentTexts().at(-1)).toEqual(['zu-duy', 'Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.']);
  });

  it('confirms nothing for an admin who lost admin rights', async () => {
    await showDraft();
    await database.query(`DELETE FROM memberships WHERE user_id = '${duyUserId}'`);
    await insertMembership(database, { workspaceId, userId: duyUserId, displayName: 'Duy', role: 'member' });

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'draft' }]);
    expect(sentTexts()).toEqual([['zu-duy', NO_CHOICE_TEXT]]);
  });

  it('confirms nothing for a draft cancelled meanwhile', async () => {
    const taskId = await showDraft();
    await database.query(`UPDATE scheduled_tasks SET status = 'cancelled' WHERE id = '${taskId}'`);

    await harness.receiveText('zu-duy', '1');
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'cancelled' }]);
    expect(sentTexts()).toEqual([['zu-duy', NO_CHOICE_TEXT]]);
  });

  it('answers a number that is not 1 or 2 with the no-choice text and clears the choice', async () => {
    await showDraft();

    await harness.receiveText('zu-duy', '3');
    await harness.receiveText('zu-duy', '1');
    await harness.sendAllQueuedTexts();

    expect(await database.query('SELECT status FROM scheduled_tasks')).toEqual([{ status: 'draft' }]);
    expect(sentTexts()).toEqual([['zu-duy', NO_CHOICE_TEXT], ['zu-duy', NO_CHOICE_TEXT]]);
  });

  it('clears a stored workspace choice when the admin writes the word for save', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Thử');
    await insertMembership(database, { workspaceId: otherWorkspaceId, userId: duyUserId, displayName: 'Duy', role: 'admin' });
    await database.query(
      `UPDATE channel_identities SET pending_choice = '{"kind":"workspace_pick","workspace_ids":["${workspaceId}"]}'::jsonb WHERE external_user_id = 'zu-duy'`,
    );

    await harness.receiveText('zu-duy', 'luu');

    expect(await database.query('SELECT pending_choice FROM channel_identities WHERE external_user_id = \'zu-duy\'')).toEqual([
      { pending_choice: null },
    ]);
  });
});
