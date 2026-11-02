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
};

export async function insertScheduledTask(database: TemporaryDatabase, task: NewScheduledTask): Promise<string> {
  const schedule = task.runOnceAt ? `'once', ${timestamp(task.runOnceAt)}, NULL` : `'daily', NULL, '18:00'`;
  const [row] = await database.query<{ id: string }>(
    `INSERT INTO scheduled_tasks (workspace_id, created_by, title, instruction, status, next_run_at, repeat, run_once_at, time_of_day)
     VALUES (${literal(task.workspaceId)}, ${literal(task.createdBy)}, ${literal(task.title ?? 'Báo cáo hằng ngày')},
       ${literal(task.instruction ?? 'Lập báo cáo.')}, ${literal(task.status ?? 'draft')}, ${timestamp(task.nextRunAt ?? null)}, ${schedule})
     RETURNING id`,
  );
  if (!row) throw new Error('scheduled task not inserted');
  return row.id;
}
