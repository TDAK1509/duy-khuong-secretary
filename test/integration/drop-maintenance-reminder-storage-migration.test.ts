import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as dropMaintenanceReminderStorage } from '../../src/app/db/migrations/0054_drop_maintenance_reminder_storage.ts';
import { restoreMaintenanceReminderStorage } from './maintenance-reminder-storage.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that drops the maintenance reminder storage', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    await restoreMaintenanceReminderStorage(database);
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    dropMaintenanceReminderStorage({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    await database.query(`BEGIN; ${statements.join(';\n')}; COMMIT`);
  }

  it('removes the reminder table and the rules column and keeps the task with its instruction', async () => {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const taskId = await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', instruction: 'Nhắc thay dầu' });

    await runMigration();

    const [table] = await database.query<{ table_name: string | null }>(`SELECT to_regclass('maintenance_notifications') AS table_name`);
    const columns = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'scheduled_tasks'`,
    );
    expect(table).toEqual({ table_name: null });
    expect(columns.map((column) => column.column_name)).not.toContain('maintenance_rules');
    expect(await database.query('SELECT id, status, instruction FROM scheduled_tasks')).toEqual([
      { id: taskId, status: 'active', instruction: 'Nhắc thay dầu' },
    ]);
  });
});
