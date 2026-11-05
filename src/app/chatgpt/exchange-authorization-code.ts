import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { issueTokens, type IssuedTokens } from './issue-tokens.ts';
import { hashSecretToken } from './secret-token.ts';

export type CodeExchange = { code: string; now: Date };

export type TokenOutcome = { kind: 'issued'; tokens: IssuedTokens } | { kind: 'invalid_grant' };

type SignInRow = { id: string; membership_id: string; client_id: string };

export function exchangeAuthorizationCode(database: Database, exchange: CodeExchange): Promise<TokenOutcome> {
  return runInTransaction(database, async (transaction) => {
    const signIn = await lockConfirmedSignIn(transaction, exchange);
    if (signIn === null) return { kind: 'invalid_grant' };
    return connectSignIn(transaction, signIn, exchange.now);
  });
}

async function lockConfirmedSignIn(transaction: Transaction, { code, now }: CodeExchange): Promise<SignInRow | null> {
  const [signIn] = await transaction.query<SignInRow>(
    `SELECT id, membership_id, client_id FROM chatgpt_sign_ins
     WHERE authorization_code_hash = $1 AND expires_at > $2 FOR UPDATE`,
    [hashSecretToken(code), now],
  );
  return signIn ?? null;
}

async function connectSignIn(transaction: Transaction, signIn: SignInRow, now: Date): Promise<TokenOutcome> {
  const tokens = issueTokens(now);
  await transaction.query('DELETE FROM chatgpt_sign_ins WHERE id = $1', [signIn.id]);
  await transaction.query(
    `INSERT INTO chatgpt_connections
       (membership_id, client_id, access_token_hash, access_expires_at, refresh_token_hash, refresh_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [signIn.membership_id, signIn.client_id, tokens.accessTokenHash, tokens.accessExpiresAt, tokens.refreshTokenHash, tokens.refreshExpiresAt],
  );
  return { kind: 'issued', tokens };
}
