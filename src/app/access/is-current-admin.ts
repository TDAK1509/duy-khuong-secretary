import type { Transaction } from '../db/transaction.ts';

export async function isCurrentAdmin(transaction: Transaction, membershipId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM memberships WHERE id = $1 AND role = 'admin' FOR SHARE`, [membershipId]);
  return rows.length > 0;
}

export async function isCurrentWorkspaceAdmin(transaction: Transaction, { workspaceId, userId }: { workspaceId: string; userId: string }): Promise<boolean> {
  const rows = await transaction.query(
    `SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND role = 'admin' FOR SHARE`,
    [workspaceId, userId],
  );
  return rows.length > 0;
}

export async function findAdminMembershipId(transaction: Transaction, { workspaceId, userId }: { workspaceId: string; userId: string }): Promise<string | null> {
  const [membership] = await transaction.query<{ id: string }>(
    `SELECT id FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND role = 'admin' FOR SHARE`,
    [workspaceId, userId],
  );
  return membership?.id ?? null;
}
