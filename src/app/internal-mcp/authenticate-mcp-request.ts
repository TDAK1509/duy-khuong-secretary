import { hashSecretToken } from '../internal-admin/secret-token.ts';
import type { Database } from '../db/transaction.ts';

export type AuthResult =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden' }
  | { kind: 'authenticated'; userId: string };

const SESSION_QUERY = `
  SELECT session.user_id, users.is_internal
  FROM internal_sessions session
  JOIN users ON users.id = session.user_id
  WHERE session.token_hash = $1 AND session.expires_at > $2`;

export async function authenticateMcpRequest(
  database: Database,
  authorization: string | undefined,
  now: Date,
): Promise<AuthResult> {
  const token = extractBearerToken(authorization);
  if (token === null) return { kind: 'unauthenticated' };
  return lookUpSession(database, token, now);
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  return token.length > 0 ? token : null;
}

async function lookUpSession(database: Database, token: string, now: Date): Promise<AuthResult> {
  const { rows } = await database.query<{ user_id: string; is_internal: boolean }>(SESSION_QUERY, [
    hashSecretToken(token),
    now,
  ]);
  const row = rows[0];
  if (row === undefined) return { kind: 'unauthenticated' };
  if (!row.is_internal) return { kind: 'forbidden' };
  return { kind: 'authenticated', userId: row.user_id };
}
