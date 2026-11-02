import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('the scheduled tasks table', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await database.drop();
  });

  function insertRaw(columns: string, values: string): Promise<unknown> {
    return database.query(
      `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, ${columns})
       VALUES ('${workspaceId}', '${userId}', 'Báo cáo', 'Lập báo cáo.', ${values})`,
    );
  }

  it('refuses a second open draft of the same admin in the same workspace', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'draft' });

    await expect(insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'draft' })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it('allows many cancelled and active tasks of the same admin', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'cancelled' });
    await insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'cancelled' });
    await insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'active' });

    await expect(insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'active' })).resolves.toEqual(expect.any(String));
  });

  it('refuses a daily task without a time of day', async () => {
    await expect(insertRaw('repeat', `'daily'`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a daily task with a weekday', async () => {
    await expect(insertRaw('repeat, time_of_day, weekday', `'daily', '18:00', 1`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a monthly task on day 29', async () => {
    await expect(insertRaw('repeat, time_of_day, day_of_month', `'monthly', '18:00', 29`)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a draft with a next run', async () => {
    await expect(
      insertRaw('repeat, time_of_day, next_run_at', `'daily', '18:00', now()`),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('refuses a second task with the same creation key', async () => {
    await insertRaw('repeat, time_of_day, creation_key', `'daily', '18:00', 'M:1'`);

    await expect(insertRaw('repeat, time_of_day, creation_key', `'daily', '18:00', 'M:1'`)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it('refuses an empty title', async () => {
    await expect(
      database.query(
        `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, repeat, time_of_day)
         VALUES ('${workspaceId}', '${userId}', '', 'Lập báo cáo.', 'daily', '18:00')`,
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('deletes the tasks of a deleted workspace', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: userId, status: 'active' });

    await database.query(`DELETE FROM workspaces WHERE id = '${workspaceId}'`);

    expect(await database.query('SELECT 1 FROM scheduled_tasks')).toEqual([]);
  });
});
