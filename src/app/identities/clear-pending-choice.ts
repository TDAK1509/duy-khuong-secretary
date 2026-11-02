import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';
import { isBareNumber } from './pending-choice.ts';

export async function clearPendingChoice(transaction: Transaction, identity: ChannelIdentity): Promise<void> {
  await transaction.query('UPDATE channel_identities SET pending_choice = NULL WHERE id = $1', [identity.id]);
}

export async function clearChoiceUnlessAnswered(
  transaction: Transaction,
  identity: ChannelIdentity,
  text: string | null,
): Promise<void> {
  const isAnswer = text !== null && isBareNumber(text);
  if (!isAnswer) await clearPendingChoice(transaction, identity);
}
