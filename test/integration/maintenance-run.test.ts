import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertRecordRow } from './record-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_MS = 60_000;
const OIL_AFTER_30_DAYS = [{ maintenance_item: 'dầu máy', age_days: 30 }];

describe('the daily maintenance reminder run', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;
  let lanUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    harness.clock.setTo(new Date('2026-10-31T07:00:00+07:00'));
    await database.query(`UPDATE channel_identities SET last_inbound_at = '2026-10-30T07:00:00+07:00'`);
  });

  afterEach(async () => {
    await harness.close();
  });

  function insertReminderTask(task: Partial<NewScheduledTask> = {}): Promise<string> {
    const dueAt = new Date(harness.clock.now().getTime() - MINUTE_MS);
    return insertScheduledTask(database, {
      workspaceId,
      createdBy: duyUserId,
      status: 'active',
      nextRunAt: dueAt,
      maintenanceRules: OIL_AFTER_30_DAYS,
      ...task,
    });
  }

  function insertOilChange(sentOn: string, plate = '29C12345', userId = lanUserId, senderName = 'Lan'): Promise<string> {
    return insertRecordRow(database, {
      workspaceId,
      userId,
      senderName,
      category: 'maintenance',
      maintenanceItem: 'dầu máy',
      vehiclePlate: plate,
      createdAt: new Date(`${sentOn}T10:00:00+07:00`),
    });
  }

  it('gives a record old enough to the model in the due list', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask();

    await harness.runTick();

    const userTurn = harness.chat.requests[0]?.turns[0];
    expect(userTurn).toMatchObject({ role: 'user', text: expect.stringContaining('Hồ sơ bảo dưỡng đến hạn:') });
    expect(userTurn).toMatchObject({ text: expect.stringContaining('29C12345') });
  });
});
