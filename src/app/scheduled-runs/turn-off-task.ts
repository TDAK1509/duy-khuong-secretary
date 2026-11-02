import type { Database } from '../db/transaction.ts';
import type { ClaimedTask } from './claim-due-task.ts';

export async function turnOffTask(database: Database, task: ClaimedTask): Promise<void> {
  await database.query(
    `UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL, locked_until = NULL
     WHERE id = $1 AND status = 'active' AND next_run_at = $2::timestamptz`,
    [task.id, task.claimedNextRunAt],
  );
}
