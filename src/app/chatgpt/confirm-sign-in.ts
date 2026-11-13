import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { hashLoginCode, isLoginCodeShape } from '../internal-admin/login-code.ts';
import { generateSecretToken, hashSecretToken } from '../internal-admin/secret-token.ts';
import { MAX_FAILED_ATTEMPTS } from './sign-in-limits.ts';

export type SignInConfirmation = { browserKey: string; typedCode: string; now: Date };

export type SignInOutcome =
  | { kind: 'confirmed'; redirectUri: string; state: string | null; authorizationCode: string }
  | { kind: 'wrong_code' }
  | { kind: 'too_many_attempts' }
  | { kind: 'expired' };

type SignInRow = { id: string; redirect_uri: string; state: string | null; failed_attempts: number };

export function confirmSignIn(database: Database, confirmation: SignInConfirmation): Promise<SignInOutcome> {
  return runInTransaction(database, (transaction) => confirmInTransaction(transaction, confirmation));
}

async function confirmInTransaction(transaction: Transaction, confirmation: SignInConfirmation): Promise<SignInOutcome> {
  const signIn = await lockSignIn(transaction, confirmation);
  if (signIn === null) return { kind: 'expired' };
  if (signIn.failed_attempts >= MAX_FAILED_ATTEMPTS) return { kind: 'too_many_attempts' };
  if (!isLoginCodeShape(confirmation.typedCode)) return { kind: 'wrong_code' };
  const membershipId = await useUpLoginCode(transaction, confirmation);
  if (membershipId === null) return countFailedAttempt(transaction, signIn.id);
  return bindSignIn(transaction, signIn, membershipId);
}

async function lockSignIn(transaction: Transaction, { browserKey, now }: SignInConfirmation): Promise<SignInRow | null> {
  const [signIn] = await transaction.query<SignInRow>(
    `SELECT id, redirect_uri, state, failed_attempts FROM chatgpt_sign_ins
     WHERE browser_key_hash = $1 AND expires_at > $2 FOR UPDATE`,
    [hashSecretToken(browserKey), now],
  );
  return signIn ?? null;
}

async function useUpLoginCode(transaction: Transaction, { typedCode, now }: SignInConfirmation): Promise<string | null> {
  const [loginCode] = await transaction.query<{ membership_id: string }>(
    'DELETE FROM chatgpt_login_codes WHERE code_hash = $1 AND expires_at > $2 RETURNING membership_id',
    [hashLoginCode(typedCode), now],
  );
  return loginCode?.membership_id ?? null;
}

async function countFailedAttempt(transaction: Transaction, signInId: string): Promise<SignInOutcome> {
  await transaction.query('UPDATE chatgpt_sign_ins SET failed_attempts = failed_attempts + 1 WHERE id = $1', [signInId]);
  return { kind: 'wrong_code' };
}

async function bindSignIn(transaction: Transaction, signIn: SignInRow, membershipId: string): Promise<SignInOutcome> {
  const authorizationCode = generateSecretToken();
  await transaction.query('UPDATE chatgpt_sign_ins SET membership_id = $2, authorization_code_hash = $3 WHERE id = $1', [
    signIn.id,
    membershipId,
    hashSecretToken(authorizationCode),
  ]);
  return { kind: 'confirmed', redirectUri: signIn.redirect_uri, state: signIn.state, authorizationCode };
}
