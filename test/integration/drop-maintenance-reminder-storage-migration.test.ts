import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migrated database without the maintenance reminder storage', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('has no reminder table and no rules column, and keeps the task with its instruction', async () => {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', instruction: 'Nhắc thay dầu' });

    const [table] = await database.query<{ table_name: string | null }>(`SELECT to_regclass('maintenance_notifications') AS table_name`);
    const columns = await database.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'scheduled_tasks'`,
    );
    const tasks = await database.query('SELECT status, instruction FROM scheduled_tasks');

    expect(table).toEqual({ table_name: null });
    expect(columns.map((column) => column.column_name)).not.toContain('maintenance_rules');
    expect(tasks).toEqual([{ status: 'active', instruction: 'Nhắc thay dầu' }]);
  });
});
