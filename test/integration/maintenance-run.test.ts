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

  it('writes each due record in the shape of the plan', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask({ instruction: 'Nhắc tôi.' });

    await harness.runTick();

    const dueList = '[{"plate":"29C12345","maintenance_item":"dầu máy","sent_by":"Lan","sent_on":"01/10/2026","occurred_on":null,"days_since_sent":30}]';
    expect(harness.chat.requests[0]?.turns).toEqual([
      { role: 'user', text: `Nhắc tôi.\n\nHồ sơ bảo dưỡng đến hạn:\n${dueList}`, image: null },
    ]);
  });

  it('sends the reminder the model wrote for a record old enough', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask();
    harness.chat.replyWith('Xe 29C12345 cần thay dầu máy.');

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([
      ['zu-duy', 'Xe 29C12345 cần thay dầu máy.'],
    ]);
  });

  it('calls no model and queues nothing for a record not yet old enough', async () => {
    await insertOilChange('2026-10-02');
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
  });

  it('still moves the next run of a task that had nothing due', async () => {
    await insertOilChange('2026-10-02');
    await insertReminderTask({ nextRunAt: new Date('2026-10-31T06:59:00+07:00') });

    await harness.runTick();

    expect(await database.query('SELECT next_run_at, last_run_at, locked_until FROM scheduled_tasks')).toEqual([
      { next_run_at: new Date('2026-10-31T18:00:00+07:00'), last_run_at: harness.clock.now(), locked_until: null },
    ]);
  });
});
