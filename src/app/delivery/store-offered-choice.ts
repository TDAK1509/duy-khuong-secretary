import type { Transaction } from '../db/transaction.ts';

export async function storeOfferedChoice(transaction: Transaction, messageId: string): Promise<void> {
  await transaction.query(
    `UPDATE channel_identities identity
     SET pending_choice = message.offered_choice - 'source_received_at'
     FROM outbound_messages message
     WHERE message.id = $1 AND message.offered_choice IS NOT NULL
       AND identity.channel = message.channel
       AND identity.account_id = message.account_id
       AND identity.external_user_id = message.external_user_id`,
    [messageId],
  );
}
