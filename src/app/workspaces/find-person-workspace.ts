import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';

export type PersonInWorkspaces = Pick<ChannelIdentity, 'userId' | 'currentWorkspaceId'>;

export async function findPersonWorkspace(transaction: Transaction, identity: PersonInWorkspaces): Promise<string | null> {
  if (identity.userId === null) return null;
  const [membership] = await transaction.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM memberships WHERE user_id = $1
     ORDER BY COALESCE(workspace_id = $2::uuid, false) DESC, created_at, id
     LIMIT 1`,
    [identity.userId, identity.currentWorkspaceId],
  );
  return membership?.workspace_id ?? null;
}
