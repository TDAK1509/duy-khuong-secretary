import { hashSecretToken } from '../../src/app/chatgpt/secret-token.ts';
import { CHATGPT_CLIENT_ID } from './chatgpt-sign-in-requests.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type NewConnection = { userId: string; accessToken: string; refreshToken: string; refreshExpiresAt: Date };

export async function insertConnection(database: TemporaryDatabase, connection: NewConnection): Promise<void> {
  await database.query(
    `INSERT INTO chatgpt_connections (membership_id, client_id, access_token_hash, access_expires_at, refresh_token_hash,
       refresh_expires_at)
     SELECT id, ${literal(CHATGPT_CLIENT_ID)}, ${literal(hashSecretToken(connection.accessToken))}, now(),
       ${literal(hashSecretToken(connection.refreshToken))}, ${timestamp(connection.refreshExpiresAt)}
     FROM memberships WHERE user_id = ${literal(connection.userId)}`,
  );
}
