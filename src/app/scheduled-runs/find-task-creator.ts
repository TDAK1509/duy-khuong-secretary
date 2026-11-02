import type { Database } from '../db/transaction.ts';
import type { ClaimedTask } from './claim-due-task.ts';

export type TaskCreator = { membershipId: string; displayName: string; workspaceName: string };

export async function findTaskCreator(database: Database, task: ClaimedTask): Promise<TaskCreator | null> {
  const { rows } = await database.query<{ id: string; display_name: string; name: string }>(
    `SELECT membership.id, membership.display_name, workspace.name
     FROM memberships membership JOIN workspaces workspace ON workspace.id = membership.workspace_id
     WHERE membership.workspace_id = $1 AND membership.user_id = $2 AND membership.role = 'admin'`,
    [task.workspaceId, task.createdBy],
  );
  const [row] = rows;
  return row ? { membershipId: row.id, displayName: row.display_name, workspaceName: row.name } : null;
}
