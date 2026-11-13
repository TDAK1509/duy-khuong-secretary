import type { Transaction } from '../db/transaction.ts';
import { formatTaskSummary } from './format-task-summary.ts';
import { readSchedule, SCHEDULE_COLUMNS, type ScheduleRow } from './schedule-columns.ts';

type SummaryRow = ScheduleRow & {
  id: string;
  title: string;
  instruction: string;
  next_run_at: Date;
};

export async function loadTaskSummaries(
  transaction: Transaction,
  taskIds: string[],
  owner: { userId: string; workspaceId: string },
): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const rows = await transaction.query<SummaryRow>(
    `SELECT id, title, instruction, next_run_at, ${SCHEDULE_COLUMNS} FROM scheduled_tasks
     WHERE id = ANY($1) AND created_by = $2 AND workspace_id = $3 AND status = 'active' AND next_run_at IS NOT NULL`,
    [taskIds, owner.userId, owner.workspaceId],
  );
  return taskIds.flatMap((id) => rows.filter((row) => row.id === id)).map(summarizeRow);
}

function summarizeRow(row: SummaryRow): string {
  return formatTaskSummary({
    title: row.title,
    schedule: readSchedule(row),
    firstRun: row.next_run_at,
    instruction: row.instruction,
  });
}
