import type { Database } from '../db/transaction.ts';
import { decryptToken } from './token-cipher.ts';

export async function readAccessKey(
  database: Database,
  channel: string,
  accountId: string,
  encryptionKey: string,
): Promise<string | null> {
  const { rows } = await database.query<{ access_token_encrypted: string }>(
    'SELECT access_token_encrypted FROM channel_connections WHERE channel = $1 AND account_id = $2',
    [channel, accountId],
  );
  const [connection] = rows;
  return connection ? decryptToken(connection.access_token_encrypted, encryptionKey) : null;
}
