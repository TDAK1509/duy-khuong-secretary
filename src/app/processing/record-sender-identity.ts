import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { readStoredChoice } from '../identities/pending-choice.ts';
import type { Transaction } from '../db/transaction.ts';
import { readSentAt, type ClaimedEvent } from './claimed-event.ts';

type IdentityRow = { id: string; user_id: string | null; current_workspace_id: string | null; pending_choice: unknown };

export async function recordSenderIdentity(transaction: Transaction, event: ClaimedEvent): Promise<ChannelIdentity> {
  const sentAt = readSentAt(event);
  const [row] = await transaction.query<IdentityRow>(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, last_inbound_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel, account_id, external_user_id) DO UPDATE SET last_inbound_at = GREATEST(channel_identities.last_inbound_at, EXCLUDED.last_inbound_at)
     RETURNING id, user_id, current_workspace_id, pending_choice`,
    [event.channel, event.accountId, event.externalUserId, sentAt],
  );
  if (!row) throw new Error('the sender identity was not recorded');
  return {
    id: row.id,
    userId: row.user_id,
    currentWorkspaceId: row.current_workspace_id,
    pendingChoice: readStoredChoice(row.pending_choice),
  };
}
