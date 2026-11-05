import type { Database } from '../db/transaction.ts';
import { SIGN_IN_VALID_FOR_MS } from './sign-in-limits.ts';
import { generateSecretToken, hashSecretToken } from './secret-token.ts';

export type SignInRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
};

export async function startSignIn(database: Database, request: SignInRequest, now: Date): Promise<string> {
  const browserKey = generateSecretToken();
  await database.query(
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
