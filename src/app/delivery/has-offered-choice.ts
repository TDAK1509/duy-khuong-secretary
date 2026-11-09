import type { Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';

export async function hasOfferedChoice(transaction: Transaction, event: ClaimedEvent): Promise<boolean> {
  const [result] = await transaction.query<{ has_offer: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM outbound_messages
       WHERE offered_choice ->> 'source_event_id' = $1
         AND channel = $2 AND account_id = $3 AND external_user_id = $4
     ) AS has_offer`,
    [event.id, event.channel, event.accountId, event.externalUserId],
  );
  return result?.has_offer ?? false;
}
