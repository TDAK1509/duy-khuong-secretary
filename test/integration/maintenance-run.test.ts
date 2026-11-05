import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertRecordRow } from './record-rows.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertScheduledTask, type NewScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

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
      category: 'bảo dưỡng',
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

  it('finds a due record by its maintenance item, whatever its category', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      category: 'sửa chữa xe',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-07-23T10:00:00+07:00'),
    });
    await insertReminderTask({ maintenanceRules: [{ maintenance_item: 'dầu máy', age_days: 90 }] });

    await harness.runTick();

    expect(harness.chat.requests[0]?.turns[0]).toMatchObject({ text: expect.stringContaining('29C12345') });
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

  it('ignores an old record when another driver sent a newer one for the same truck and part', async () => {
    await insertOilChange('2026-09-01', '29C12345', harness.hungUserId, 'Hùng');
    await insertOilChange('2026-10-21');
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('records a notification for every record the reminder covered', async () => {
    const firstRecordId = await insertOilChange('2026-10-01', '29C12345');
    const secondRecordId = await insertOilChange('2026-10-01', '51D67890');
    const taskId = await insertReminderTask();
    harness.chat.replyWith('Có 2 xe cần thay dầu.');

    await harness.runTick();

    const rows = await database.query<{ task_id: string; record_id: string; workspace_id: string }>(
      'SELECT task_id, record_id, workspace_id FROM maintenance_notifications ORDER BY record_id',
    );
    expect(rows).toEqual(
      [firstRecordId, secondRecordId].sort().map((recordId) => ({ task_id: taskId, record_id: recordId, workspace_id: workspaceId })),
    );
  });

  it('does not remind again about a record the task already reminded', async () => {
    const recordId = await insertOilChange('2026-10-01');
    const taskId = await insertReminderTask();
    await database.query(
      `INSERT INTO maintenance_notifications (task_id, record_id, workspace_id) VALUES ('${taskId}', '${recordId}', '${workspaceId}')`,
    );

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('queues nothing and records no notification when the model has nothing to report', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask();
    harness.chat.replyWith('KHONG_CO_THONG_BAO');

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
    expect(await database.query('SELECT 1 FROM maintenance_notifications')).toEqual([]);
  });

  it('records no notification when the model fails', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask();
    harness.chat.failWith('unavailable');

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM maintenance_notifications')).toEqual([]);
  });

  it('never treats a part without a rule as due', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      category: 'bảo dưỡng',
      maintenanceItem: 'lốp',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-04-14T10:00:00+07:00'),
    });
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('matches a rule to a part ignoring accents and case', async () => {
    await insertOilChange('2026-09-21');
    await insertReminderTask({ maintenanceRules: [{ maintenance_item: 'dau may', age_days: 30 }] });
    harness.chat.replyWith('Nhắc');

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text])).toEqual([['zu-duy', 'Nhắc']]);
  });

  it('never treats a record of another workspace as due', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải Vy');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy', role: 'admin' });
    await insertRecordRow(database, {
      workspaceId: otherWorkspaceId,
      userId: vyUserId,
      senderName: 'Vy',
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '30A99999',
      createdAt: new Date('2026-09-21T10:00:00+07:00'),
    });
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests).toEqual([]);
  });

  it('measures the age from the upload time, not from the time the record was saved', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-10-01T10:00:00+07:00'),
      savedAt: new Date('2026-10-30T10:00:00+07:00'),
    });
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests).toHaveLength(1);
  });

  it('counts days by the Vietnam date of the upload', async () => {
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-10-01T00:30:00+07:00'),
    });
    await insertReminderTask();

    await harness.runTick();

    expect(harness.chat.requests[0]?.turns[0]).toMatchObject({ text: expect.stringContaining('"sent_on":"01/10/2026"') });
  });

  it('lists a record once when two rules name the same part', async () => {
    const recordId = await insertOilChange('2026-10-01');
    const taskId = await insertReminderTask({
      maintenanceRules: [
        { maintenance_item: 'dầu máy', age_days: 30 },
        { maintenance_item: 'Dau may', age_days: 20 },
      ],
    });
    harness.chat.replyWith('Nhắc');

    await harness.runTick();

    expect(await database.query('SELECT task_id, record_id FROM maintenance_notifications')).toEqual([
      { task_id: taskId, record_id: recordId },
    ]);
  });

  it('records no notification when the creator has no channel identity to send to', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask();
    await database.query(`DELETE FROM channel_identities WHERE user_id = '${duyUserId}'`);
    harness.chat.replyWith('Xe 29C12345 cần thay dầu máy.');

    await harness.runTick();

    expect(await database.query('SELECT 1 FROM outbound_messages')).toEqual([]);
    expect(await database.query('SELECT 1 FROM maintenance_notifications')).toEqual([]);
  });

  it('treats a blank reply as a failed run and records no notification', async () => {
    await insertOilChange('2026-10-01');
    await insertReminderTask({ title: 'Nhắc bảo dưỡng' });
    harness.chat.replyWith('  ');

    await harness.runTick();
    await harness.sendQueuedTexts();

    expect(await database.query('SELECT 1 FROM maintenance_notifications')).toEqual([]);
    expect(harness.channel.texts.map((sent) => sent.text)).toEqual(['Lịch "Nhắc bảo dưỡng" chạy lỗi. Lần chạy sau sẽ thử lại.']);
  });
});
