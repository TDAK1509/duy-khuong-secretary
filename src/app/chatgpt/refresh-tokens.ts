import type { Database } from '../db/transaction.ts';
import { issueTokens } from './issue-tokens.ts';
import type { TokenOutcome } from './exchange-authorization-code.ts';
import { hashSecretToken } from '../internal-admin/secret-token.ts';

export type TokenRefresh = { refreshToken: string; now: Date };

export async function refreshTokens(database: Database, { refreshToken, now }: TokenRefresh): Promise<TokenOutcome> {
  const tokens = issueTokens(now);
  const { rowCount } = await database.query(
    `UPDATE chatgpt_connections
     SET access_token_hash = $1, access_expires_at = $2, refresh_token_hash = $3, refresh_expires_at = $4
     WHERE refresh_token_hash = $5 AND refresh_expires_at > $6`,
    [tokens.accessTokenHash, tokens.accessExpiresAt, tokens.refreshTokenHash, tokens.refreshExpiresAt, hashSecretToken(refreshToken), now],
  );
  return rowCount === 1 ? { kind: 'issued', tokens } : { kind: 'invalid_grant' };
}
