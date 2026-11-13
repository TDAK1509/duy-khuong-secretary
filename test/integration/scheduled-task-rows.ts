import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewScheduledTask = {
  workspaceId: string;
  createdBy: string;
  title?: string;
  instruction?: string;
  status?: 'draft' | 'active' | 'cancelled';
  runOnceAt?: Date;
  nextRunAt?: Date | null;
  lockedUntil?: Date | null;
  lastRunAt?: Date | null;
  maintenanceRules?: { maintenance_item: string; age_days: number }[];
};

export async function insertScheduledTask(database: TemporaryDatabase, task: NewScheduledTask): Promise<string> {
  const schedule = task.runOnceAt ? `'once', ${timestamp(task.runOnceAt)}, NULL` : `'daily', NULL, '18:00'`;
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, status, next_run_at, locked_until, last_run_at, repeat, run_once_at, time_of_day, maintenance_rules)
     VALUES (${literal(task.workspaceId)}, ${literal(task.createdBy)}, ${literal(task.title ?? 'Báo cáo hằng ngày')},
       ${literal(task.instruction ?? 'Lập báo cáo.')}, ${literal(task.status ?? 'draft')}, ${timestamp(task.nextRunAt ?? null)}, ${timestamp(task.lockedUntil ?? null)}, ${timestamp(task.lastRunAt ?? null)}, ${schedule}, ${literal(JSON.stringify(task.maintenanceRules ?? []))}::jsonb)
     RETURNING id`,
  );
  if (!row) throw new Error('scheduled task not inserted');
  return row.id;
}
