import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

export async function cancelTask(database: Database, scope: AccessScope, taskId: string): Promise<boolean> {
  const { rowCount } = await database.query(
    `UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL
     WHERE id = $1 AND workspace_id = $2 AND created_by = $3 AND status = 'active'`,
    [taskId, scope.workspaceId, scope.userId],
  );
  return rowCount === 1;
}
