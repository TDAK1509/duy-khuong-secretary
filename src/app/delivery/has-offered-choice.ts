import type { Transaction } from '../db/transaction.ts';

export async function hasOfferedChoice(transaction: Transaction, eventId: string): Promise<boolean> {
  const [result] = await transaction.query<{ has_offer: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM outbound_messages message
       JOIN inbound_events event
         ON event.channel = message.channel
        AND event.account_id = message.account_id
        AND event.external_user_id = message.external_user_id
       WHERE event.id = $1
         AND (message.offered_choice ->> 'source_received_at')::timestamptz = event.received_at
     ) AS has_offer`,
    [eventId],
  );
  return result?.has_offer ?? false;
}
