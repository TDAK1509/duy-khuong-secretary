import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_MS = 60_000;

describe('a scheduled task that still has stored maintenance rules', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    harness.clock.setTo(new Date('2026-10-31T07:00:00+07:00'));
    await database.query(`UPDATE channel_identities SET last_inbound_at = '2026-10-30T07:00:00+07:00'`);
    await insertRecordRow(database, {
      workspaceId,
      userId: lanUserId,
      senderName: 'Lan',
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      createdAt: new Date('2026-10-01T10:00:00+07:00'),
    });
    await insertScheduledTask(database, {
      workspaceId,
      createdBy: duyUserId,
      status: 'active',
      instruction: 'Nhắc thay dầu',
      nextRunAt: new Date(harness.clock.now().getTime() - MINUTE_MS),
      maintenanceRules: [{ maintenance_item: 'dầu máy', age_days: 30 }],
    });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('runs its instruction only', async () => {
    await harness.runTick();

    expect(harness.chat.requests[0]?.turns).toEqual([{ role: 'user', text: 'Nhắc thay dầu' }]);
  });
});
