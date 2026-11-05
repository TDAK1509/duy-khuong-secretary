import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { generateSecretToken, hashSecretToken } from './secret-token.ts';
import { KEEP_EXPIRED_FOR_MS, MAX_OPEN_SIGN_INS, SIGN_IN_VALID_FOR_MS } from './sign-in-limits.ts';

export type SignInRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
};

export function startSignIn(database: Database, request: SignInRequest, now: Date): Promise<string | null> {
  return runInTransaction(database, async (transaction) => {
    await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended('chatgpt_sign_ins', 0))`);
    await deleteLongExpiredSignIns(transaction, now);
    if ((await countOpenSignIns(transaction, now)) >= MAX_OPEN_SIGN_INS) return null;
    return insertSignIn(transaction, request, now);
  });
}

async function deleteLongExpiredSignIns(transaction: Transaction, now: Date): Promise<void> {
  await transaction.query('DELETE FROM chatgpt_sign_ins WHERE expires_at < $1', [new Date(now.getTime() - KEEP_EXPIRED_FOR_MS)]);
}

async function countOpenSignIns(transaction: Transaction, now: Date): Promise<number> {
  const [open] = await transaction.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM chatgpt_sign_ins WHERE expires_at > $1',
    [now],
  );
  return open?.count ?? 0;
}

async function insertSignIn(transaction: Transaction, request: SignInRequest, now: Date): Promise<string> {
  const browserKey = generateSecretToken();
  await transaction.query(
    `INSERT INTO chatgpt_sign_ins (browser_key_hash, client_id, redirect_uri, state, code_challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      hashSecretToken(browserKey),
      request.clientId,
      request.redirectUri,
      request.state,
      request.codeChallenge,
      new Date(now.getTime() + SIGN_IN_VALID_FOR_MS),
    ],
  );
  return browserKey;
}
