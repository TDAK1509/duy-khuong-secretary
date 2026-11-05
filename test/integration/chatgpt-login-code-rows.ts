import { hashLoginCode } from '../../src/app/chatgpt/login-code.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewLoginCode = { userId: string; code: string; expiresAt: Date };

export async function insertLoginCode(database: TemporaryDatabase, loginCode: NewLoginCode): Promise<void> {
  await database.query(
    `INSERT INTO chatgpt_login_codes (user_id, membership_id, code_hash, expires_at)
     SELECT user_id, id, ${literal(hashLoginCode(loginCode.code))}, ${timestamp(loginCode.expiresAt)}
     FROM memberships WHERE user_id = ${literal(loginCode.userId)}`,
  );
}
