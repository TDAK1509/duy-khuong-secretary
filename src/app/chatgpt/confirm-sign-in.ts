import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { hashLoginCode, isLoginCodeShape } from './login-code.ts';
import { generateSecretToken, hashSecretToken } from './secret-token.ts';

export type SignInConfirmation = { browserKey: string; typedCode: string; now: Date };

export type SignInOutcome =
  | { kind: 'confirmed'; redirectUri: string; state: string | null; authorizationCode: string }
  | { kind: 'wrong_code' };

type SignInRow = { id: string; redirect_uri: string; state: string | null };

export function confirmSignIn(database: Database, confirmation: SignInConfirmation): Promise<SignInOutcome> {
  return runInTransaction(database, async (transaction) => {
    const [signIn] = await transaction.query<SignInRow>(
      'SELECT id, redirect_uri, state FROM chatgpt_sign_ins WHERE browser_key_hash = $1 FOR UPDATE',
      [hashSecretToken(confirmation.browserKey)],
    );
    if (!signIn) throw new Error('no sign-in matches the browser key');
    if (!isLoginCodeShape(confirmation.typedCode)) return { kind: 'wrong_code' };
    const membershipId = await useUpLoginCode(transaction, confirmation.typedCode);
    if (membershipId === null) return countFailedAttempt(transaction, signIn.id);
    const authorizationCode = generateSecretToken();
    await bindSignIn(transaction, signIn.id, { membershipId, authorizationCode });
    return { kind: 'confirmed', redirectUri: signIn.redirect_uri, state: signIn.state, authorizationCode };
  });
}

async function useUpLoginCode(transaction: Transaction, typedCode: string): Promise<string | null> {
  const [loginCode] = await transaction.query<{ membership_id: string }>(
    'DELETE FROM chatgpt_login_codes WHERE code_hash = $1 RETURNING membership_id',
    [hashLoginCode(typedCode)],
  );
  return loginCode?.membership_id ?? null;
}

type Binding = { membershipId: string; authorizationCode: string };

async function bindSignIn(transaction: Transaction, signInId: string, { membershipId, authorizationCode }: Binding): Promise<void> {
  await transaction.query('UPDATE chatgpt_sign_ins SET membership_id = $2, authorization_code_hash = $3 WHERE id = $1', [
    signInId,
    membershipId,
    hashSecretToken(authorizationCode),
  ]);
}

async function countFailedAttempt(transaction: Transaction, signInId: string): Promise<SignInOutcome> {
  await transaction.query('UPDATE chatgpt_sign_ins SET failed_attempts = failed_attempts + 1 WHERE id = $1', [signInId]);
  return { kind: 'wrong_code' };
}
