import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { isBareNumber, type PendingChoice } from '../identities/pending-choice.ts';
import { confirmDraft } from '../schedules/confirm-draft.ts';
import { readConfirmReply } from '../schedules/confirm-reply.ts';
import { NO_PENDING_CHOICE_TEXT } from './conversation-texts.ts';
import { answerSwitchCommand, isSwitchCommand, pickWorkspace } from '../workspaces/switch-workspace.ts';

export type MemberMessage = {
  identity: ChannelIdentity;
  userId: string;
  workspaceId: string;
  text: string | null;
  now: Date;
};

type DraftChoice = Extract<PendingChoice, { kind: 'draft_confirm' }>;

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<Reply | null> {
  const { userId, workspaceId, text, identity } = message;
  if (text === null) return null;
  if (identity.pendingChoice?.kind === 'draft_confirm' && isConfirmCandidate(text)) {
    return answerDraftConfirmation(transaction, message, identity.pendingChoice, text);
  }
  if (isBareNumber(text)) return answerBareNumber(transaction, message, Number(text.trim()));
  if (isSwitchCommand(text)) return answerSwitchCommand(transaction, userId, workspaceId);
  return null;
}

function isConfirmCandidate(text: string): boolean {
  return isBareNumber(text) || readConfirmReply(text) !== null;
}

async function answerDraftConfirmation(
  transaction: Transaction,
  { identity, userId, now }: MemberMessage,
  choice: DraftChoice,
  text: string,
): Promise<Reply> {
  const reply = await confirmDraft(transaction, { identity, userId, now }, choice, readConfirmReply(text));
  return reply ?? { text: NO_PENDING_CHOICE_TEXT };
}

async function answerBareNumber(transaction: Transaction, message: MemberMessage, number: number): Promise<Reply> {
  const { pendingChoice } = message.identity;
  if (pendingChoice?.kind !== 'workspace_pick') return { text: NO_PENDING_CHOICE_TEXT };
  return pickWorkspace(transaction, message, pendingChoice, number);
}
