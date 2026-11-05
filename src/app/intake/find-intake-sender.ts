import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { findPersonWorkspace } from '../workspaces/find-person-workspace.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { isSwitchCommand } from '../workspaces/switch-workspace.ts';

export type IntakeSender = { userId: string; workspaceId: string; membershipId: string; role: 'admin' | 'member' };

type IdentityRow = { user_id: string | null; current_workspace_id: string | null };

export async function findIntakeSender(
  database: Database,
  event: ClaimedEvent,
  text: string | null,
): Promise<IntakeSender | null> {
  if (text !== null && !isIntakeText(text)) return null;
  return runInTransaction(database, async (transaction) => {
    const [identity] = await transaction.query<IdentityRow>(
      `SELECT user_id, current_workspace_id FROM channel_identities
       WHERE channel = $1 AND account_id = $2 AND external_user_id = $3`,
      [event.channel, event.accountId, event.externalUserId],
    );
    if (!identity?.user_id) return null;
    const person = { userId: identity.user_id, currentWorkspaceId: identity.current_workspace_id };
    const workspaceId = await findPersonWorkspace(transaction, person);
    return workspaceId === null ? null : findMembership(transaction, identity.user_id, workspaceId);
  });
}

async function findMembership(transaction: Transaction, userId: string, workspaceId: string): Promise<IntakeSender> {
  const [membership] = await transaction.query<{ id: string; role: 'admin' | 'member' }>(
    'SELECT id, role FROM memberships WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );
  if (!membership) throw new Error('the sender has no membership in the workspace');
  return { userId, workspaceId, membershipId: membership.id, role: membership.role };
}

export function isIntakeText(text: string): boolean {
  return !isInviteCodeMessage(text) && !isBareNumber(text) && !isSwitchCommand(text);
}
