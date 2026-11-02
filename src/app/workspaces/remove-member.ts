import type { Database } from '../db/transaction.ts';

export type RemoveMemberResult = { kind: 'removed'; displayName: string } | { kind: 'is_caller' };

export type MemberRemoval = { workspaceId: string; callerUserId: string; membershipId: string };

export async function removeMember(database: Database, removal: MemberRemoval): Promise<RemoveMemberResult> {
  const { rows } = await database.query<{ user_id: string; display_name: string }>(
    'SELECT user_id, display_name FROM memberships WHERE id = $1 AND workspace_id = $2',
    [removal.membershipId, removal.workspaceId],
  );
  const [member] = rows;
  if (member?.user_id === removal.callerUserId) return { kind: 'is_caller' };
  await database.query('DELETE FROM memberships WHERE id = $1', [removal.membershipId]);
  return { kind: 'removed', displayName: member?.display_name ?? '' };
}
