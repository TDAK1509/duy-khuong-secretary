import type { Database } from '../db/transaction.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from '../schedules/schedule-columns.ts';
import type { Schedule } from '../schedules/schedule.ts';

const LOCK_MS = 10 * 60 * 1000;

export type ClaimedTask = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  instruction: string;
  schedule: Schedule;
  claimedNextRunAt: string;
};

type ClaimedRow = ScheduleRow & {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  instruction: string;
  claimed_next_run_at: string;
};

export async function claimDueTask(database: Database, now: Date): Promise<ClaimedTask | null> {
  const { rows } = await database.query<ClaimedRow>(
    `WITH candidate AS (
       SELECT id FROM scheduled_tasks
       WHERE status = 'active' AND next_run_at <= $1 AND (locked_until IS NULL OR locked_until < $1)
       ORDER BY next_run_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE scheduled_tasks
     SET locked_until = $2
     FROM candidate
     WHERE scheduled_tasks.id = candidate.id
     RETURNING scheduled_tasks.id, workspace_id, created_by, title, instruction,
       next_run_at::text AS claimed_next_run_at, ${SCHEDULE_COLUMNS}`,
    [now, new Date(now.getTime() + LOCK_MS)],
  );
  const [row] = rows;
  return row ? describeClaim(row) : null;
}

function describeClaim(row: ClaimedRow): ClaimedTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    title: row.title,
    instruction: row.instruction,
    schedule: readSchedule(row),
    claimedNextRunAt: row.claimed_next_run_at,
  };
}
