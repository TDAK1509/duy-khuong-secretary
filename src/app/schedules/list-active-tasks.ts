import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './schedule-columns.ts';
import type { Schedule } from './schedule.ts';

export type ActiveTask = { id: string; title: string; instruction: string; schedule: Schedule; nextRunAt: Date | null };

type ActiveTaskRow = ScheduleRow & { id: string; title: string; instruction: string; next_run_at: Date | null };

export async function listActiveTasks(database: Database, scope: AccessScope): Promise<ActiveTask[]> {
  const { rows } = await database.query<ActiveTaskRow>(
    `SELECT id, title, instruction, next_run_at, ${SCHEDULE_COLUMNS} FROM scheduled_tasks
     WHERE workspace_id = $1 AND created_by = $2 AND status = 'active'
     ORDER BY created_at, id`,
    [scope.workspaceId, scope.userId],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    instruction: row.instruction,
    schedule: readSchedule(row),
    nextRunAt: row.next_run_at,
  }));
}
