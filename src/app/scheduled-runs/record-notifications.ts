import type { Transaction } from '../db/transaction.ts';
import type { ClaimedTask } from './claim-due-task.ts';

export async function recordNotifications(transaction: Transaction, task: ClaimedTask, recordIds: string[]): Promise<void> {
  await transaction.query(
    `INSERT INTO maintenance_notifications (task_id, record_id, workspace_id)
     SELECT $1, record_id, $3 FROM unnest($2::uuid[]) AS reminded(record_id)`,
    [task.id, recordIds, task.workspaceId],
  );
}
