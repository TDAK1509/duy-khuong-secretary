import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import { clearPendingChoice } from '../identities/clear-pending-choice.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import { NO_PENDING_CHOICE_TEXT } from './conversation-texts.ts';
import { answerSwitchCommand, isSwitchCommand, pickWorkspace } from '../workspaces/switch-workspace.ts';

export type MemberMessage = { identity: ChannelIdentity; userId: string; workspaceId: string; text: string | null };

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<Reply | null> {
  const { identity, userId, workspaceId, text } = message;
  if (text !== null && isBareNumber(text)) return answerBareNumber(transaction, identity, Number(text.trim()));
  await clearPendingChoice(transaction, identity);
  if (text !== null && isSwitchCommand(text)) return answerSwitchCommand(transaction, userId, workspaceId);
  return null;
}

async function answerBareNumber(transaction: Transaction, identity: ChannelIdentity, number: number): Promise<Reply> {
  if (identity.pendingChoice === null) return { text: NO_PENDING_CHOICE_TEXT };
  return pickWorkspace(transaction, identity, identity.pendingChoice, number);
}
