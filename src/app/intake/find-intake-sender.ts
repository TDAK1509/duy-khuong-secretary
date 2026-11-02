import { runInTransaction, type Database } from '../db/transaction.ts';
import { isBareNumber } from '../identities/pending-choice.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import { findPersonWorkspace } from '../workspaces/find-person-workspace.ts';
import { isInviteCodeMessage } from '../workspaces/invite-code.ts';
import { isSwitchCommand } from '../workspaces/switch-workspace.ts';

export type IntakeSender = { userId: string; workspaceId: string };

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
    return workspaceId === null ? null : { userId: identity.user_id, workspaceId };
  });
}

function isIntakeText(text: string): boolean {
  return !isInviteCodeMessage(text) && !isBareNumber(text) && !isSwitchCommand(text);
}
