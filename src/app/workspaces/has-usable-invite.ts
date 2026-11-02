import type { Database } from '../db/transaction.ts';
import { hashInviteCode } from './invite-code.ts';

export async function hasUsableInvite(database: Database, code: string, now: Date): Promise<boolean> {
  const { rows } = await database.query(
    'SELECT 1 FROM workspace_invites WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2',
    [hashInviteCode(code), now],
  );
  return rows.length > 0;
}
