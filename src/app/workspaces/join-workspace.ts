import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { linkIdentityToNewUser } from '../identities/link-identity-to-new-user.ts';
import { rememberZaloName } from '../identities/remember-zalo-name.ts';
import { setCurrentWorkspace } from '../identities/set-current-workspace.ts';
import type { Transaction } from '../db/transaction.ts';
import { hashInviteCode } from './invite-code.ts';

type Role = 'admin' | 'member';

export type JoinRequest = { identity: ChannelIdentity; code: string; zaloName: string | null; now: Date };

export type JoinResult =
  | { kind: 'joined'; workspaceName: string; displayName: string; role: Role }
  | { kind: 'already_member'; workspaceName: string }
  | { kind: 'invalid_code' };

type Invite = { id: string; workspaceId: string; workspaceName: string; displayName: string; role: Role };

export async function joinWithInviteCode(transaction: Transaction, request: JoinRequest): Promise<JoinResult> {
  const invite = await findUsableInvite(transaction, request.code, request.now);
  if (invite === null) return { kind: 'invalid_code' };
  if (await isMemberOf(transaction, request.identity, invite.workspaceId)) {
    return { kind: 'already_member', workspaceName: invite.workspaceName };
  }
  await admit(transaction, request, invite);
  return { kind: 'joined', workspaceName: invite.workspaceName, displayName: invite.displayName, role: invite.role };
}

type InviteRow = { id: string; workspace_id: string; workspace_name: string; display_name: string; role: Role };

async function findUsableInvite(transaction: Transaction, code: string, now: Date): Promise<Invite | null> {
  const [row] = await transaction.query<InviteRow>(
    `SELECT invite.id, invite.workspace_id, workspace.name AS workspace_name, invite.display_name, invite.role
     FROM workspace_invites invite
     JOIN workspaces workspace ON workspace.id = invite.workspace_id
     WHERE invite.code_hash = $1 AND invite.used_at IS NULL AND invite.expires_at > $2
     FOR UPDATE OF invite`,
    [hashInviteCode(code), now],
  );
  if (!row) return null;
  return { id: row.id, workspaceId: row.workspace_id, workspaceName: row.workspace_name, displayName: row.display_name, role: row.role };
}

async function isMemberOf(transaction: Transaction, identity: ChannelIdentity, workspaceId: string): Promise<boolean> {
  if (identity.userId === null) return false;
  const memberships = await transaction.query(
    'SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, identity.userId],
  );
  return memberships.length > 0;
}

async function admit(transaction: Transaction, request: JoinRequest, invite: Invite): Promise<void> {
  const { identity, zaloName, now } = request;
  const userId = identity.userId ?? (await linkIdentityToNewUser(transaction, identity));
  await transaction.query(
    'INSERT INTO memberships (workspace_id, user_id, role, display_name) VALUES ($1, $2, $3, $4)',
    [invite.workspaceId, userId, invite.role, invite.displayName],
  );
  await setCurrentWorkspace(transaction, identity, invite.workspaceId);
  await rememberZaloName(transaction, identity, zaloName);
  await transaction.query('UPDATE workspace_invites SET used_at = $2, used_by = $3 WHERE id = $1', [invite.id, now, userId]);
}
