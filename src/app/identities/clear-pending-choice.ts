import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';

export async function clearPendingChoice(transaction: Transaction, identity: ChannelIdentity): Promise<void> {
  await transaction.query('UPDATE channel_identities SET pending_choice = NULL WHERE id = $1', [identity.id]);
}
