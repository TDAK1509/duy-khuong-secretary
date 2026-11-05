import { runInTransaction, type Database } from '../db/transaction.ts';
import { hashLoginCode } from './login-code.ts';
import { generateSecretToken, hashSecretToken } from './secret-token.ts';

export type SignInConfirmation = { browserKey: string; typedCode: string; now: Date };

export type SignInOutcome =
  | { kind: 'confirmed'; redirectUri: string; state: string | null; authorizationCode: string }
  | { kind: 'wrong_code' };

type SignInRow = { redirect_uri: string; state: string | null };

export function confirmSignIn(database: Database, confirmation: SignInConfirmation): Promise<SignInOutcome> {
  return runInTransaction(database, async (transaction) => {
    const [signIn] = await transaction.query<SignInRow>(
      'SELECT redirect_uri, state FROM chatgpt_sign_ins WHERE browser_key_hash = $1',
      [hashSecretToken(confirmation.browserKey)],
    );
    if (!signIn) throw new Error('no sign-in matches the browser key');
    const loginCodes = await transaction.query('SELECT 1 FROM chatgpt_login_codes WHERE code_hash = $1', [hashLoginCode(confirmation.typedCode)]);
    if (loginCodes.length === 0) return { kind: 'wrong_code' };
    return { kind: 'confirmed', redirectUri: signIn.redirect_uri, state: signIn.state, authorizationCode: generateSecretToken() };
  });
}
