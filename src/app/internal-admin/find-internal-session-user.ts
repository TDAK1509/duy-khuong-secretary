import { hashSecretToken } from '../chatgpt/secret-token.ts';
import type { Database, Transaction } from '../db/transaction.ts';

const SESSION_USER_QUERY = `
  SELECT session.user_id FROM internal_sessions session
  JOIN users ON users.id = session.user_id
  WHERE session.token_hash = $1 AND session.expires_at > $2 AND users.is_internal`;

export async function findInternalSessionUser(database: Database, token: string, now: Date): Promise<string | null> {
  const { rows } = await database.query<{ user_id: string }>(SESSION_USER_QUERY, [hashSecretToken(token), now]);
  return rows[0]?.user_id ?? null;
}

export async function findInternalSessionUserInTransaction(transaction: Transaction, token: string, now: Date): Promise<string | null> {
  const [row] = await transaction.query<{ user_id: string }>(SESSION_USER_QUERY, [hashSecretToken(token), now]);
  return row?.user_id ?? null;
}
