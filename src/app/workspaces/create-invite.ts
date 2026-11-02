import type { Database } from '../db/transaction.ts';
import { generateInviteCode, hashInviteCode } from './invite-code.ts';
import { isTakenCodeError, MAX_CODE_ATTEMPTS } from './invite-rules.ts';

export type NewInvite = {
  workspaceId: string;
  createdBy: string;
  displayName: string;
  role: 'admin' | 'member';
  expiresAt: Date;
};

export async function createInvite(
  database: Database,
  invite: NewInvite,
  generateCode: () => string = generateInviteCode,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode();
    try {
      await insertInvite(database, invite, code);
      return code;
    } catch (error) {
      if (!isTakenCodeError(error)) throw error;
    }
  }
  throw new Error(`no unused invite code found in ${MAX_CODE_ATTEMPTS} attempts`);
}

async function insertInvite(database: Database, invite: NewInvite, code: string): Promise<void> {
  await database.query(
    `INSERT INTO workspace_invites (workspace_id, code_hash, display_name, role, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [invite.workspaceId, hashInviteCode(code), invite.displayName, invite.role, invite.createdBy, invite.expiresAt],
  );
}
