import { hashSecretToken } from '../../src/app/chatgpt/secret-token.ts';
import { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI } from './chatgpt-sign-in-requests.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export type SignInRowsToInsert = { count: number; expiresAt: Date };

export async function insertSignIns(database: TemporaryDatabase, { count, expiresAt }: SignInRowsToInsert): Promise<void> {
  await database.query(
    `INSERT INTO chatgpt_sign_ins (browser_key_hash, client_id, redirect_uri, code_challenge, expires_at)
     SELECT 'key-' || number, 'client', 'redirect', 'challenge', ${timestamp(expiresAt)}
     FROM generate_series(1, ${count}) AS number`,
  );
}

export type ConfirmedSignIn = { userId: string; authorizationCode: string; codeChallenge: string; expiresAt: Date };

export async function insertConfirmedSignIn(database: TemporaryDatabase, signIn: ConfirmedSignIn): Promise<void> {
  await database.query(
    `INSERT INTO chatgpt_sign_ins (browser_key_hash, client_id, redirect_uri, code_challenge, membership_id,
       authorization_code_hash, expires_at)
     SELECT 'confirmed-key', ${literal(CHATGPT_CLIENT_ID)}, ${literal(CHATGPT_REDIRECT_URI)}, ${literal(signIn.codeChallenge)}, id,
       ${literal(hashSecretToken(signIn.authorizationCode))}, ${timestamp(signIn.expiresAt)}
     FROM memberships WHERE user_id = ${literal(signIn.userId)}`,
  );
}
