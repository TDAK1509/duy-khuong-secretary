import { z } from 'zod';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from './claimed-event.ts';

const payloadSchema = z.object({ sent_at: z.iso.datetime({ offset: true }) });

type IdentityRow = { id: string; user_id: string | null; current_workspace_id: string | null };

export async function recordSenderIdentity(transaction: Transaction, event: ClaimedEvent): Promise<ChannelIdentity> {
  const sentAt = new Date(payloadSchema.parse(event.payload).sent_at);
  const [row] = await transaction.query<IdentityRow>(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, last_inbound_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel, account_id, external_user_id) DO UPDATE SET last_inbound_at = GREATEST(channel_identities.last_inbound_at, EXCLUDED.last_inbound_at)
     RETURNING id, user_id, current_workspace_id`,
    [event.channel, event.accountId, event.externalUserId, sentAt],
  );
  if (!row) throw new Error('the sender identity was not recorded');
  return { id: row.id, userId: row.user_id, currentWorkspaceId: row.current_workspace_id };
}
