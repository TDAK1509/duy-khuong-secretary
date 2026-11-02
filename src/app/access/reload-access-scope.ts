import type { Database } from '../db/transaction.ts';
import type { AccessScope } from './access-scope.ts';

export async function reloadAccessScope(database: Database, caller: AccessScope): Promise<AccessScope | null> {
  const { rows } = await database.query<{ role: 'admin' | 'member' }>(
    'SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [caller.workspaceId, caller.userId],
  );
  const [membership] = rows;
  return membership ? { workspaceId: caller.workspaceId, userId: caller.userId, role: membership.role } : null;
}
