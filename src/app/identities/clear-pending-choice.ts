import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from './channel-identity.ts';
import { isConfirmReplyTo } from '../schedules/confirm-reply.ts';
import { isBareNumber } from './pending-choice.ts';

export async function clearPendingChoice(transaction: Transaction, identity: ChannelIdentity): Promise<void> {
  await transaction.query('UPDATE channel_identities SET pending_choice = NULL WHERE id = $1', [identity.id]);
}

export async function clearPendingChoiceOfSender(
  transaction: Transaction,
  sender: { channel: string; accountId: string; externalUserId: string },
): Promise<void> {
  await transaction.query(
    `UPDATE channel_identities SET pending_choice = NULL
     WHERE channel = $1 AND account_id = $2 AND external_user_id = $3`,
    [sender.channel, sender.accountId, sender.externalUserId],
  );
}

export async function clearChoiceUnlessAnswered(
  transaction: Transaction,
  identity: ChannelIdentity,
  text: string | null,
): Promise<void> {
  const isAnswer = text !== null && (isBareNumber(text) || isConfirmReplyTo(identity.pendingChoice, text));
  if (!isAnswer) await clearPendingChoice(transaction, identity);
}
