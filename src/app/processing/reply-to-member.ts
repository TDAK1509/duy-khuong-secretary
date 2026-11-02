import type { Transaction } from '../db/transaction.ts';
import { isSwitchCommand, listWorkspaces } from '../workspaces/switch-workspace.ts';

export type MemberMessage = { userId: string; workspaceId: string; text: string | null };

export async function replyToMember(transaction: Transaction, message: MemberMessage): Promise<string | null> {
  const { userId, workspaceId, text } = message;
  if (text !== null && isSwitchCommand(text)) return listWorkspaces(transaction, userId, workspaceId);
  return null;
}
