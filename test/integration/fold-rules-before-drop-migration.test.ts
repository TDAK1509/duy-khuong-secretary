import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as dropMaintenanceReminderStorage } from '../../src/app/db/migrations/0054_drop_maintenance_reminder_storage.ts';
import { restoreMaintenanceReminderStorage, storeMaintenanceRules } from './maintenance-reminder-storage.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const OIL_AND_TYRES = [
  { maintenance_item: 'dầu máy', age_days: 30 },
  { maintenance_item: 'lốp', age_days: 90 },
];

describe('the migration that drops the maintenance reminder storage', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    await restoreMaintenanceReminderStorage(database);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    dropMaintenanceReminderStorage({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    await database.query(`BEGIN; ${statements.join(';\n')}; COMMIT`);
  }

  async function readInstructions(): Promise<string[]> {
    const rows = await database.query<{ instruction: string }>('SELECT instruction FROM scheduled_tasks');
    return rows.map((row) => row.instruction);
  }

  it('folds the rules of an active task that was created after the first fold', async () => {
    const taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', instruction: 'Nhắc bảo dưỡng' });
    await storeMaintenanceRules(database, taskId, OIL_AND_TYRES);

    await runMigration();

    expect(await readInstructions()).toEqual([
      'Nhắc bảo dưỡng\n\nMốc nhắc bảo dưỡng: dầu máy sau 30 ngày; lốp sau 90 ngày. Dùng maintenance_status để xem lần gửi gần nhất của từng xe. Chỉ nhắc xe có số ngày kể từ lần gửi gần nhất từ mốc trở lên.',
    ]);
  });

  it('does not fold the rules of a task twice', async () => {
    const foldedInstruction = 'Nhắc bảo dưỡng\n\nMốc nhắc bảo dưỡng: dầu máy sau 30 ngày. Dùng maintenance_status để xem lần gửi gần nhất của từng xe. Chỉ nhắc xe có số ngày kể từ lần gửi gần nhất từ mốc trở lên.';
    const taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', instruction: foldedInstruction });
    await storeMaintenanceRules(database, taskId, OIL_AND_TYRES);

    await runMigration();

    expect(await readInstructions()).toEqual([foldedInstruction]);
  });
});
