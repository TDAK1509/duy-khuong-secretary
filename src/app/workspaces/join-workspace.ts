import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { linkIdentityToNewUser } from '../identities/link-identity-to-new-user.ts';
import { rememberZaloName } from '../identities/remember-zalo-name.ts';
import { setCurrentWorkspace } from '../identities/set-current-workspace.ts';
import type { Transaction } from '../db/transaction.ts';
import { hashInviteCode } from './invite-code.ts';

type InviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  display_name: string;
  role: 'admin' | 'member';
};

export type JoinRequest = { identity: ChannelIdentity; code: string; zaloName: string | null; now: Date };

export type JoinResult =
  | { kind: 'joined'; workspaceName: string; displayName: string; role: 'admin' | 'member' }
  | { kind: 'invalid_code' };

export async function joinWithInviteCode(transaction: Transaction, request: JoinRequest): Promise<JoinResult> {
  const { identity, code, zaloName, now } = request;
  const [invite] = await transaction.query<InviteRow>(
    `SELECT invite.id, invite.workspace_id, workspace.name AS workspace_name, invite.display_name, invite.role
     FROM workspace_invites invite
     JOIN workspaces workspace ON workspace.id = invite.workspace_id
     WHERE invite.code_hash = $1 AND invite.used_at IS NULL
     FOR UPDATE OF invite`,
    [hashInviteCode(code)],
  );
  if (!invite) return { kind: 'invalid_code' };
  const userId = await linkIdentityToNewUser(transaction, identity);
  await transaction.query(
    'INSERT INTO memberships (workspace_id, user_id, role, display_name) VALUES ($1, $2, $3, $4)',
    [invite.workspace_id, userId, invite.role, invite.display_name],
  );
  await setCurrentWorkspace(transaction, identity, invite.workspace_id);
  await rememberZaloName(transaction, identity, zaloName);
  await transaction.query('UPDATE workspace_invites SET used_at = $2, used_by = $3 WHERE id = $1', [
    invite.id,
    now,
    userId,
  ]);
  return { kind: 'joined', workspaceName: invite.workspace_name, displayName: invite.display_name, role: invite.role };
}
