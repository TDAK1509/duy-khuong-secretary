import type { Database } from '../db/transaction.ts';

export type RemoveMemberResult = { kind: 'removed'; displayName: string };

export async function removeMember(database: Database, workspaceId: string, membershipId: string): Promise<RemoveMemberResult> {
  const { rows } = await database.query<{ display_name: string }>(
    'DELETE FROM memberships WHERE id = $1 AND workspace_id = $2 RETURNING display_name',
    [membershipId, workspaceId],
  );
  return { kind: 'removed', displayName: rows[0]?.display_name ?? '' };
}
