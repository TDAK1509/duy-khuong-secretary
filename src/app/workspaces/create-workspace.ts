import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { generateInviteCode, hashInviteCode } from './invite-code.ts';
import {
  hasLengthBetween,
  INVITE_VALID_FOR_MS,
  isTakenCodeError,
  MAX_CODE_ATTEMPTS,
  MAX_DISPLAY_NAME_LENGTH,
} from './invite-rules.ts';

const MAX_WORKSPACE_NAME_LENGTH = 80;

export type NewWorkspace = { workspaceName: string; adminName: string };

export type CreateWorkspaceResult =
  | { kind: 'created'; workspaceId: string; workspaceName: string; inviteCode: string; expiresAt: Date }
  | { kind: 'invalid'; field: 'workspace_name' | 'admin_name' };

export async function createWorkspaceWithFirstAdminInvite(
  database: Database,
  newWorkspace: NewWorkspace,
  now: Date,
  generateCode: () => string = generateInviteCode,
): Promise<CreateWorkspaceResult> {
  const workspaceName = newWorkspace.workspaceName.trim();
  const adminName = newWorkspace.adminName.trim();
  if (!hasLengthBetween(workspaceName, MAX_WORKSPACE_NAME_LENGTH)) {
    return { kind: 'invalid', field: 'workspace_name' };
  }
  if (!hasLengthBetween(adminName, MAX_DISPLAY_NAME_LENGTH)) {
    return { kind: 'invalid', field: 'admin_name' };
  }
  const expiresAt = new Date(now.getTime() + INVITE_VALID_FOR_MS);
  return createWithFreshCode(database, { workspaceName, adminName, expiresAt }, generateCode);
}

type ValidWorkspace = { workspaceName: string; adminName: string; expiresAt: Date };

async function createWithFreshCode(
  database: Database,
  workspace: ValidWorkspace,
  generateCode: () => string,
): Promise<CreateWorkspaceResult> {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const inviteCode = generateCode();
    try {
      const workspaceId = await insertWorkspaceWithInvite(database, workspace, inviteCode);
      return { kind: 'created', workspaceId, inviteCode, ...workspace };
    } catch (error) {
      if (!isTakenCodeError(error)) throw error;
    }
  }
  throw new Error(`no unused invite code found in ${MAX_CODE_ATTEMPTS} attempts`);
}

function insertWorkspaceWithInvite(
  database: Database,
  { workspaceName, adminName, expiresAt }: ValidWorkspace,
  inviteCode: string,
): Promise<string> {
  return runInTransaction(database, async (transaction) => {
    const workspaceId = await insertWorkspace(transaction, workspaceName);
    await insertAdminInvite(transaction, { workspaceId, adminName, inviteCode, expiresAt });
    return workspaceId;
  });
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
