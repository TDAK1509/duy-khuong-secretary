import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import { isSwitchCommand, listWorkspaces, pickWorkspace } from '../workspaces/switch-workspace.ts';

export type MemberMessage = { identity: ChannelIdentity; userId: string; workspaceId: string; text: string | null };

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<Reply | null> {
  const { identity, userId, workspaceId, text } = message;
  if (text !== null && isBareNumber(text) && identity.pendingChoice !== null) {
    return pickWorkspace(transaction, identity, identity.pendingChoice, Number(text.trim()));
  }
  if (text !== null && isSwitchCommand(text)) return listWorkspaces(transaction, userId, workspaceId);
  return null;
}
