import type { Database } from '../db/transaction.ts';

export type ChatProfile = { workspaceName: string; displayName: string; joinedAt: Date; role: 'admin' | 'member' };

export async function loadChatProfile(database: Database, membershipId: string): Promise<ChatProfile | null> {
  const { rows } = await database.query<{ name: string; display_name: string; created_at: Date; role: 'admin' | 'member' }>(
    `SELECT workspace.name, membership.display_name, membership.created_at, membership.role
     FROM memberships membership JOIN workspaces workspace ON workspace.id = membership.workspace_id
     WHERE membership.id = $1`,
    [membershipId],
  );
  const [row] = rows;
  return row ? { workspaceName: row.name, displayName: row.display_name, joinedAt: row.created_at, role: row.role } : null;
}
