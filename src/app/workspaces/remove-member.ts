import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceMembers } from './lock-workspace-members.ts';

export type RemoveMemberResult =
  | { kind: 'removed'; displayName: string }
  | { kind: 'is_caller' }
  | { kind: 'not_found' }
  | { kind: 'denied' };

export type MemberRemoval = { workspaceId: string; callerUserId: string; membershipId: string };

export function removeMember(database: Database, removal: MemberRemoval): Promise<RemoveMemberResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceMembers(transaction, removal.workspaceId);
    if (!(await isAdminOf(transaction, removal))) return { kind: 'denied' };
    return deleteMember(transaction, removal);
  });
}

async function isAdminOf(transaction: Transaction, { workspaceId, callerUserId }: MemberRemoval): Promise<boolean> {
  const admins = await transaction.query(
    `SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND role = 'admin'`,
    [workspaceId, callerUserId],
  );
  return admins.length > 0;
}

async function deleteMember(transaction: Transaction, removal: MemberRemoval): Promise<RemoveMemberResult> {
  const [member] = await transaction.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [removal.membershipId, removal.workspaceId],
  );
  if (!member) return { kind: 'not_found' };
  if (member.user_id === removal.callerUserId) return { kind: 'is_caller' };
  await transaction.query('DELETE FROM memberships WHERE id = $1', [removal.membershipId]);
  return { kind: 'removed', displayName: member.display_name };
}
