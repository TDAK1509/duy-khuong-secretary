import { hashSecretToken } from '../chatgpt/secret-token.ts';
import type { Database } from '../db/transaction.ts';

export async function findInternalSessionUser(database: Database, token: string, now: Date): Promise<string | null> {
  const { rows } = await database.query<{ user_id: string }>(
    `SELECT session.user_id FROM internal_sessions session
     JOIN users ON users.id = session.user_id
     WHERE session.token_hash = $1 AND session.expires_at > $2 AND users.is_internal`,
    [hashSecretToken(token), now],
  );
  return rows[0]?.user_id ?? null;
}
