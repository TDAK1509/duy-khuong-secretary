import { hashSecretToken } from '../../src/app/internal-admin/secret-token.ts';
import { hashLoginCode } from '../../src/app/internal-admin/login-code.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const DEFAULT_LAST_INBOUND_AT = new Date('2026-10-01T10:00:00+07:00');

export async function makeUserInternal(database: TemporaryDatabase, userId: string): Promise<void> {
  await database.query(`UPDATE users SET is_internal = true WHERE id = ${literal(userId)}`);
}

export async function makeUserNotInternal(database: TemporaryDatabase, userId: string): Promise<void> {
  await database.query(`UPDATE users SET is_internal = false WHERE id = ${literal(userId)}`);
}

export async function insertInternalUserWithoutWorkspace(database: TemporaryDatabase, externalUserId: string): Promise<string> {
  const [user] = await database.query<{ id: string }>('INSERT INTO users (is_internal) VALUES (true) RETURNING id');
  if (!user) throw new Error('user not inserted');
  await database.query(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, user_id, last_inbound_at)
     VALUES ('zalo-oa', 'oa-1', ${literal(externalUserId)}, ${literal(user.id)}, ${timestamp(DEFAULT_LAST_INBOUND_AT)})`,
  );
  return user.id;
}

export type NewInternalLoginCode = { userId: string; code: string; expiresAt: Date };

export async function insertInternalLoginCode(database: TemporaryDatabase, loginCode: NewInternalLoginCode): Promise<void> {
  await database.query(
    `INSERT INTO internal_login_codes (user_id, code_hash, expires_at)
     VALUES (${literal(loginCode.userId)}, ${literal(hashLoginCode(loginCode.code))}, ${timestamp(loginCode.expiresAt)})`,
  );
}

export type NewInternalSession = { userId: string; token: string; expiresAt: Date };

export async function insertInternalSession(database: TemporaryDatabase, session: NewInternalSession): Promise<void> {
  await database.query(
    `INSERT INTO internal_sessions (token_hash, user_id, expires_at)
     VALUES (${literal(hashSecretToken(session.token))}, ${literal(session.userId)}, ${timestamp(session.expiresAt)})`,
  );
}
