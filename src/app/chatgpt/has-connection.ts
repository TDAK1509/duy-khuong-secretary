import type { Database } from '../db/transaction.ts';
import { hashSecretToken } from './secret-token.ts';

export async function hasConnection(database: Database, accessToken: string): Promise<boolean> {
  const { rowCount } = await database.query('SELECT 1 FROM chatgpt_connections WHERE access_token_hash = $1', [hashSecretToken(accessToken)]);
  return rowCount === 1;
}
