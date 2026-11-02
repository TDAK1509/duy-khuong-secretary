import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { generateInviteCode, hashInviteCode } from './invite-code.ts';

const MAX_WORKSPACE_NAME_LENGTH = 80;
const MAX_DISPLAY_NAME_LENGTH = 60;
const INVITE_VALID_FOR_MS = 7 * 24 * 60 * 60 * 1000;

export type NewWorkspace = { workspaceName: string; adminName: string };

export type CreateWorkspaceResult =
  | { kind: 'created'; workspaceId: string; workspaceName: string; inviteCode: string; expiresAt: Date }
  | { kind: 'invalid'; field: 'workspace_name' | 'admin_name' };

export async function createWorkspaceWithFirstAdminInvite(
  database: Database,
  newWorkspace: NewWorkspace,
  now: Date,
): Promise<CreateWorkspaceResult> {
  const workspaceName = newWorkspace.workspaceName.trim();
  const adminName = newWorkspace.adminName.trim();
  if (!hasLengthBetween(workspaceName, MAX_WORKSPACE_NAME_LENGTH)) {
    return { kind: 'invalid', field: 'workspace_name' };
  }
  if (!hasLengthBetween(adminName, MAX_DISPLAY_NAME_LENGTH)) {
    return { kind: 'invalid', field: 'admin_name' };
  }
  const inviteCode = generateInviteCode();
  const expiresAt = new Date(now.getTime() + INVITE_VALID_FOR_MS);
  const workspaceId = await runInTransaction(database, async (transaction) => {
    const workspaceId = await insertWorkspace(transaction, workspaceName);
    await insertAdminInvite(transaction, { workspaceId, adminName, inviteCode, expiresAt });
    return workspaceId;
  });
  return { kind: 'created', workspaceId, workspaceName, inviteCode, expiresAt };
}

function hasLengthBetween(name: string, maxLength: number): boolean {
  const length = [...name].length;
  return length >= 1 && length <= maxLength;
}

async function insertWorkspace(transaction: Transaction, name: string): Promise<string> {
  const [workspace] = await transaction.query<{ id: string }>(
    'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
    [name],
  );
  return workspace?.id ?? '';
}

type AdminInvite = { workspaceId: string; adminName: string; inviteCode: string; expiresAt: Date };

async function insertAdminInvite(transaction: Transaction, invite: AdminInvite): Promise<void> {
  await transaction.query(
    `INSERT INTO workspace_invites (workspace_id, code_hash, display_name, role, expires_at)
     VALUES ($1, $2, $3, 'admin', $4)`,
    [invite.workspaceId, hashInviteCode(invite.inviteCode), invite.adminName, invite.expiresAt],
  );
}
