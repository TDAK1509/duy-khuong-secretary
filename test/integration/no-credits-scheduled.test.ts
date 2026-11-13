import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, NOW, type IntakeHarness } from './intake-harness.ts';
import { setCreditBalance } from './llm-call-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_MS = 60_000;
const OIL_AFTER_30_DAYS = [{ maintenance_item: 'dầu máy', age_days: 30 }];

describe('a scheduled run of a workspace with no credits', () => {
  let harness: IntakeHarness;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    duyUserId = await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await harness.database.query(`UPDATE channel_identities SET last_inbound_at = '2026-11-01T10:00:00+07:00'`);
    await setCreditBalance(harness.database, harness.workspaceId, 0);
  });

  afterEach(async () => {
    await harness.close();
  });

  function insertDueMaintenanceTask(): Promise<string> {
    const dueAt = new Date(NOW.getTime() - MINUTE_MS);
    return insertScheduledTask(harness.database, {
      workspaceId: harness.workspaceId,
      createdBy: duyUserId,
      title: 'Nhắc bảo dưỡng',
      status: 'active',
      nextRunAt: dueAt,
      maintenanceRules: OIL_AFTER_30_DAYS,
    });
  }

  it('sends the creator the skip text and moves the task to its next run', async () => {
    await insertRecordRow(harness.database, {
      workspaceId: harness.workspaceId,
      userId: duyUserId,
      senderName: 'Duy',
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-09-01T10:00:00+07:00'),
    });
    await insertDueMaintenanceTask();

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(harness.chat.requests).toEqual([]);
    expect(harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      ['zu-duy', 'Lịch "Nhắc bảo dưỡng" chưa chạy vì nhóm đã hết credit. Lần chạy sau sẽ thử lại.'],
    ]);
    expect(await harness.database.query('SELECT next_run_at FROM scheduled_tasks')).toEqual([
      { next_run_at: new Date('2026-11-02T18:00:00+07:00') },
    ]);
  });
});
