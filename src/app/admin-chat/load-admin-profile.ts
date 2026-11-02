import type { Database } from '../db/transaction.ts';

export type AdminProfile = { workspaceName: string; displayName: string; joinedAt: Date };

export async function loadAdminProfile(database: Database, membershipId: string): Promise<AdminProfile | null> {
  const { rows } = await database.query<{ name: string; display_name: string; created_at: Date }>(
    `SELECT workspace.name, membership.display_name, membership.created_at
     FROM memberships membership JOIN workspaces workspace ON workspace.id = membership.workspace_id
     WHERE membership.id = $1`,
    [membershipId],
  );
  const [row] = rows;
  return row ? { workspaceName: row.name, displayName: row.display_name, joinedAt: row.created_at } : null;
}
