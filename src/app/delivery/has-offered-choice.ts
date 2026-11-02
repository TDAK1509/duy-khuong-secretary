import type { Transaction } from '../db/transaction.ts';

export async function hasOfferedChoice(transaction: Transaction, eventId: string): Promise<boolean> {
  const [result] = await transaction.query<{ has_offer: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM outbound_messages WHERE offered_choice ->> 'source_event_id' = $1
     ) AS has_offer`,
    [eventId],
  );
  return result?.has_offer ?? false;
}
