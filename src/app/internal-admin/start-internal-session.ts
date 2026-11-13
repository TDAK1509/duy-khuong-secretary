import { hashLoginCode } from './login-code.ts';
import { generateSecretToken, hashSecretToken } from './secret-token.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { SESSION_LIFETIME_MS } from './internal-admin-limits.ts';
import { isInternalUser } from './is-internal-user.ts';

export type SessionStart = { typedCode: string; now: Date };

export type SessionStartOutcome = { kind: 'started'; token: string } | { kind: 'wrong_code' } | { kind: 'not_internal' };

export function startInternalSession(database: Database, start: SessionStart): Promise<SessionStartOutcome> {
  return runInTransaction(database, (transaction) => startInTransaction(transaction, start));
}

async function startInTransaction(transaction: Transaction, start: SessionStart): Promise<SessionStartOutcome> {
  const userId = await useUpLoginCode(transaction, start);
  if (userId === null) return { kind: 'wrong_code' };
  if (!(await isInternalUser(transaction, userId))) return { kind: 'not_internal' };
  await deleteExpired(transaction, start.now);
  return { kind: 'started', token: await insertSession(transaction, userId, start.now) };
}

async function useUpLoginCode(transaction: Transaction, { typedCode, now }: SessionStart): Promise<string | null> {
  const [loginCode] = await transaction.query<{ user_id: string }>(
    'DELETE FROM internal_login_codes WHERE code_hash = $1 AND expires_at > $2 RETURNING user_id',
    [hashLoginCode(typedCode), now],
  );
  return loginCode?.user_id ?? null;
}

async function deleteExpired(transaction: Transaction, now: Date): Promise<void> {
  await transaction.query('DELETE FROM internal_login_codes WHERE expires_at <= $1', [now]);
  await transaction.query('DELETE FROM internal_sessions WHERE expires_at <= $1', [now]);
}

async function insertSession(transaction: Transaction, userId: string, now: Date): Promise<string> {
  const token = generateSecretToken();
  await transaction.query('INSERT INTO internal_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashSecretToken(token),
    userId,
    new Date(now.getTime() + SESSION_LIFETIME_MS),
  ]);
  return token;
}
