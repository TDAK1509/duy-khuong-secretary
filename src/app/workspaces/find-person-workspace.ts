import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';

export async function findPersonWorkspace(transaction: Transaction, identity: ChannelIdentity): Promise<string | null> {
  if (identity.userId === null) return null;
  const [membership] = await transaction.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM memberships WHERE user_id = $1 ORDER BY created_at, id LIMIT 1',
    [identity.userId],
  );
  return membership?.workspace_id ?? null;
}
