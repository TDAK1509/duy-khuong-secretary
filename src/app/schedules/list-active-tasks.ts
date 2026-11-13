import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './schedule-columns.ts';
import type { Schedule } from './schedule.ts';

export type TaskOwner = 'mine' | 'all';

export type ActiveTask = {
  id: string;
  title: string;
  instruction: string;
  schedule: Schedule;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  creatorName: string | null;
  isMine: boolean;
};

type ActiveTaskRow = ScheduleRow & {
  id: string;
  title: string;
  instruction: string;
  next_run_at: Date | null;
  last_run_at: Date | null;
  creator_name: string | null;
  is_mine: boolean;
};

export async function listActiveTasks(database: Database, scope: AccessScope, owner: TaskOwner): Promise<ActiveTask[]> {
  const { rows } = await database.query<ActiveTaskRow>(
    `SELECT task.id, task.title, task.instruction, task.next_run_at, task.last_run_at, membership.display_name AS creator_name,
       task.created_by = $2 AS is_mine, ${SCHEDULE_COLUMNS}
     FROM scheduled_tasks task
     LEFT JOIN memberships membership ON membership.workspace_id = task.workspace_id AND membership.user_id = task.created_by
     WHERE task.workspace_id = $1 AND task.status = 'active' AND ($3 = 'all' OR task.created_by = $2)
     ORDER BY task.created_at, task.id`,
    [scope.workspaceId, scope.userId, owner],
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    instruction: row.instruction,
    schedule: readSchedule(row),
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    creatorName: row.creator_name,
    isMine: row.is_mine,
  }));
}
