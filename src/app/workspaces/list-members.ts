import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { formatVietnamDate } from '../time/format-vietnam-date.ts';
import { labelRole, type Role } from './role-label.ts';

export type ListedMember = { id: string; name: string; role: 'quản lý' | 'thành viên'; joined_on: string };

export async function listMembers(database: Database, scope: AccessScope): Promise<ListedMember[]> {
  const { rows } = await database.query<{ id: string; display_name: string; role: Role; created_at: Date }>(
    `SELECT id, display_name, role, created_at
     FROM memberships
     WHERE workspace_id = $1
     ORDER BY display_name, id`,
    [scope.workspaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    role: labelRole(row.role),
    joined_on: formatVietnamDate(row.created_at),
  }));
}
