import type { Transaction } from '../db/transaction.ts';

export async function storeOfferedChoice(transaction: Transaction, messageId: string): Promise<void> {
  const [recipient] = await lockRecipientOfOffer(transaction, messageId);
  if (!recipient) return;
  if (await hasNewerInboundEvent(transaction, messageId)) return;
  await transaction.query(
    `UPDATE channel_identities
     SET pending_choice = (SELECT offered_choice - 'source_received_at' FROM outbound_messages WHERE id = $2)
     WHERE id = $1`,
    [recipient.id, messageId],
  );
}

function lockRecipientOfOffer(transaction: Transaction, messageId: string): Promise<{ id: string }[]> {
  return transaction.query<{ id: string }>(
    `SELECT identity.id
     FROM channel_identities identity
     JOIN outbound_messages message
       ON identity.channel = message.channel
      AND identity.account_id = message.account_id
      AND identity.external_user_id = message.external_user_id
     WHERE message.id = $1 AND message.offered_choice IS NOT NULL
     FOR UPDATE OF identity`,
    [messageId],
  );
}

async function hasNewerInboundEvent(transaction: Transaction, messageId: string): Promise<boolean> {
  const [result] = await transaction.query<{ is_newer: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM inbound_events newer
       JOIN outbound_messages message
         ON newer.channel = message.channel
        AND newer.account_id = message.account_id
        AND newer.external_user_id = message.external_user_id
       WHERE message.id = $1
         AND newer.received_at > (message.offered_choice ->> 'source_received_at')::timestamptz
     ) AS is_newer`,
    [messageId],
  );
  return result?.is_newer ?? false;
}
