import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as removeScheduleDrafts } from '../../src/app/db/migrations/0024_remove_schedule_drafts.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the migration that removes the schedule drafts', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await database.drop();
  });

  async function runMigration(): Promise<void> {
    const statements: string[] = [];
    removeScheduleDrafts({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  it('cancels an existing draft and clears its next run', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'draft' });

    await runMigration();

    expect(await database.query('SELECT status, next_run_at FROM scheduled_tasks')).toEqual([
      { status: 'cancelled', next_run_at: null },
    ]);
  });
});
