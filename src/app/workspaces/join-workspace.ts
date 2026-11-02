import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { linkIdentityToNewUser } from '../identities/link-identity-to-new-user.ts';
import { rememberZaloName } from '../identities/remember-zalo-name.ts';
import { setCurrentWorkspace } from '../identities/set-current-workspace.ts';
import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';
import { hashInviteCode } from './invite-code.ts';
import type { Role } from './role-label.ts';

export type JoinRequest = { identity: ChannelIdentity; code: string; zaloName: string | null; now: Date };

export type Inviter = { membershipId: string; recipient: ChannelRecipient };

export type JoinResult =
  | { kind: 'joined'; workspaceName: string; displayName: string; role: Role; inviter: Inviter | null }
  | { kind: 'already_member'; workspaceName: string }
  | { kind: 'invalid_code' };

type Invite = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  role: Role;
  createdBy: string | null;
};

export async function joinWithInviteCode(transaction: Transaction, request: JoinRequest): Promise<JoinResult> {
  const invite = await findUsableInvite(transaction, request.code, request.now);
  if (invite === null) return { kind: 'invalid_code' };
  if (await isMemberOf(transaction, request.identity, invite.workspaceId)) {
    return { kind: 'already_member', workspaceName: invite.workspaceName };
  }
  await admit(transaction, request, invite);
  const inviter = await findInviter(transaction, invite);
  return { kind: 'joined', workspaceName: invite.workspaceName, displayName: invite.displayName, role: invite.role, inviter };
}

type InviteRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  display_name: string;
  role: Role;
  created_by: string | null;
};

async function findUsableInvite(transaction: Transaction, code: string, now: Date): Promise<Invite | null> {
  const [row] = await transaction.query<InviteRow>(
    `SELECT invite.id, invite.workspace_id, workspace.name AS workspace_name, invite.display_name, invite.role, invite.created_by
     FROM workspace_invites invite
     JOIN workspaces workspace ON workspace.id = invite.workspace_id
     WHERE invite.code_hash = $1 AND invite.used_at IS NULL AND invite.expires_at > $2
     FOR UPDATE OF invite`,
    [hashInviteCode(code), now],
  );
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    displayName: row.display_name,
    role: row.role,
    createdBy: row.created_by,
  };
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

type InviterRow = { membership_id: string; channel: string; account_id: string; external_user_id: string };

async function findInviter(transaction: Transaction, invite: Invite): Promise<Inviter | null> {
  if (invite.createdBy === null) return null;
  const [row] = await transaction.query<InviterRow>(
    `SELECT membership.id AS membership_id, identity.channel, identity.account_id, identity.external_user_id
     FROM memberships membership
     JOIN channel_identities identity ON identity.user_id = membership.user_id
     WHERE membership.workspace_id = $1 AND membership.user_id = $2 AND membership.role = 'admin'`,
    [invite.workspaceId, invite.createdBy],
  );
  if (!row) return null;
  return {
    membershipId: row.membership_id,
    recipient: { channel: row.channel, accountId: row.account_id, externalUserId: row.external_user_id },
  };
}
