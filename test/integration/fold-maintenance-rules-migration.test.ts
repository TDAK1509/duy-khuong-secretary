import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { up as foldMaintenanceRules } from '../../src/app/db/migrations/0051_fold_maintenance_rules_into_instructions.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertScheduledTask } from './scheduled-task-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const OIL_AND_TYRES = [
  { maintenance_item: 'dầu máy', age_days: 30 },
  { maintenance_item: 'lốp', age_days: 90 },
];

describe('the migration that folds the maintenance rules into the instruction', () => {
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
    foldMaintenanceRules({ sql: (statement) => statements.push(statement), noTransaction: () => {} });
    for (const statement of statements) await database.query(statement);
  }

  async function readInstructions(): Promise<string[]> {
    const rows = await database.query<{ instruction: string }>('SELECT instruction FROM scheduled_tasks');
    return rows.map((row) => row.instruction);
  }

  it('ends the instruction of an active task with its rules in words', async () => {
    await insertScheduledTask(database, {
      workspaceId,
      createdBy: duyUserId,
      status: 'active',
      instruction: 'Nhắc bảo dưỡng',
      maintenanceRules: OIL_AND_TYRES,
    });

    await runMigration();

    expect(await readInstructions()).toEqual([
      'Nhắc bảo dưỡng\n\nMốc nhắc bảo dưỡng: dầu máy sau 30 ngày; lốp sau 90 ngày. Dùng maintenance_status để xem lần gửi gần nhất của từng xe. Chỉ nhắc xe có số ngày kể từ lần gửi gần nhất từ mốc trở lên.',
    ]);
  });

  it('leaves an active task with no rules unchanged', async () => {
    await insertScheduledTask(database, { workspaceId, createdBy: duyUserId, status: 'active', instruction: 'Lập báo cáo.' });

    await runMigration();

    expect(await readInstructions()).toEqual(['Lập báo cáo.']);
  });
});
