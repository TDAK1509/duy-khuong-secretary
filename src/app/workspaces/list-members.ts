import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { labelRole, type Role } from './role-label.ts';

export type ListedMember = { id: string; name: string; zalo_name: string | null; role: 'quản lý' | 'thành viên' };

export async function listMembers(database: Database, scope: AccessScope): Promise<ListedMember[]> {
  const { rows } = await database.query<{ id: string; display_name: string; zalo_name: string | null; role: Role }>(
    `SELECT membership.id, membership.display_name, identity.zalo_name, membership.role
     FROM memberships membership
     LEFT JOIN channel_identities identity ON identity.user_id = membership.user_id
     WHERE membership.workspace_id = $1
     ORDER BY membership.display_name, membership.id`,
    [scope.workspaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    zalo_name: row.zalo_name,
    role: labelRole(row.role),
  }));
}
