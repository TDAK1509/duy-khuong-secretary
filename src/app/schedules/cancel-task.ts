import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

export async function cancelTask(database: Database, scope: AccessScope, taskId: string): Promise<string | null> {
  const { rows } = await database.query<{ title: string }>(
    `UPDATE scheduled_tasks SET status = 'cancelled', next_run_at = NULL
     WHERE id = $1 AND workspace_id = $2 AND status = 'active'
     RETURNING title`,
    [taskId, scope.workspaceId],
  );
  return rows[0]?.title ?? null;
}
