import type { TokenPair } from '../../services/channel-auth/channel-auth.ts';
import type { Database } from '../db/transaction.ts';
import { encryptToken } from './token-cipher.ts';

export type ConnectionToStore = {
  channel: 'zalo-oa';
  accountId: string;
  tokens: TokenPair;
  storedAt: Date;
};

export async function storeConnection(
  database: Database,
  connection: ConnectionToStore,
  encryptionKey: string,
): Promise<void> {
  await database.query(
    `INSERT INTO channel_connections
       (channel, account_id, access_token_encrypted, refresh_token_encrypted,
        access_expires_at, refresh_expires_at, refreshed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      connection.channel,
      connection.accountId,
      encryptToken(connection.tokens.accessToken, encryptionKey),
      encryptToken(connection.tokens.refreshToken, encryptionKey),
      connection.tokens.accessExpiresAt,
      connection.tokens.refreshExpiresAt,
      connection.storedAt,
    ],
  );
}
