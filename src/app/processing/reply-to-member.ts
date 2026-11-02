import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import { NO_PENDING_CHOICE_TEXT } from './conversation-texts.ts';
import { answerSwitchCommand, isSwitchCommand, pickWorkspace } from '../workspaces/switch-workspace.ts';

export type MemberMessage = { identity: ChannelIdentity; userId: string; workspaceId: string; text: string | null };

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<Reply | null> {
  const { userId, workspaceId, text } = message;
  if (text !== null && isBareNumber(text)) return answerBareNumber(transaction, message, Number(text.trim()));
  if (text !== null && isSwitchCommand(text)) return answerSwitchCommand(transaction, userId, workspaceId);
  return null;
}

async function answerBareNumber(transaction: Transaction, message: MemberMessage, number: number): Promise<Reply> {
  const { pendingChoice } = message.identity;
  if (pendingChoice?.kind !== 'workspace_pick') return { text: NO_PENDING_CHOICE_TEXT };
  return pickWorkspace(transaction, message, pendingChoice, number);
}
