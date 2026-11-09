import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { answerDisconnectCommand, isDisconnectCommand } from '../chatgpt/answer-disconnect-command.ts';
import { answerLoginCommand } from '../chatgpt/answer-login-command.ts';
import { isLoginCommand } from '../chatgpt/login-code.ts';
import { answerNameMatch } from '../name-matches/answer-name-match.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import { NO_PENDING_CHOICE_TEXT } from './conversation-texts.ts';
import { answerSwitchCommand, isSwitchCommand, pickWorkspace } from '../workspaces/switch-workspace.ts';

export type MemberMessage = {
  identity: ChannelIdentity;
  userId: string;
  workspaceId: string;
  text: string | null;
  now: Date;
};

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<Reply | null> {
  const { userId, workspaceId, text, now } = message;
  if (text === null) return null;
  if (isBareNumber(text)) return answerBareNumber(transaction, message, Number(text.trim()));
  if (isLoginCommand(text)) return answerLoginCommand(transaction, { userId, workspaceId, now });
  if (isDisconnectCommand(text)) return answerDisconnectCommand(transaction, userId);
  if (isSwitchCommand(text)) return answerSwitchCommand(transaction, userId, workspaceId);
  return null;
}

async function answerBareNumber(transaction: Transaction, message: MemberMessage, number: number): Promise<Reply> {
  const { pendingChoice } = message.identity;
  if (pendingChoice?.kind === 'workspace_pick') return pickWorkspace(transaction, message, pendingChoice, number);
  if (pendingChoice?.kind === 'name_match') return answerNameMatch(transaction, message, pendingChoice, number);
  return { text: NO_PENDING_CHOICE_TEXT };
}
