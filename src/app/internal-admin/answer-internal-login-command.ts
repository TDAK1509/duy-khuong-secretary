import { generateLoginCode, hashLoginCode } from '../chatgpt/login-code.ts';
import type { Transaction } from '../db/transaction.ts';
import type { Reply } from '../delivery/reply.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { LOGIN_CODE_EXPLANATION, NOT_INTERNAL_TEXT } from './internal-admin-texts.ts';

const LOGIN_CODE_VALID_FOR_MS = 10 * 60 * 1000;
const INTERNAL_LOGIN_COMMAND = 'dang nhap quan tri';

export function isInternalLoginCommand(text: string): boolean {
  return toAccentFreeForm(text) === INTERNAL_LOGIN_COMMAND;
}

export async function answerInternalLoginCommand(transaction: Transaction, userId: string, now: Date): Promise<Reply> {
  if (!(await isInternalUser(transaction, userId))) return { text: NOT_INTERNAL_TEXT };
  const code = generateLoginCode();
  await storeLoginCode(transaction, { userId, code, now });
  return { text: LOGIN_CODE_EXPLANATION, followUpText: code };
}

async function isInternalUser(transaction: Transaction, userId: string): Promise<boolean> {
  const [user] = await transaction.query<{ is_internal: boolean }>('SELECT is_internal FROM users WHERE id = $1', [userId]);
  return user?.is_internal === true;
}

type NewLoginCode = { userId: string; code: string; now: Date };

async function storeLoginCode(transaction: Transaction, { userId, code, now }: NewLoginCode): Promise<void> {
  await transaction.query(
    `INSERT INTO internal_login_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
     SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [userId, hashLoginCode(code), new Date(now.getTime() + LOGIN_CODE_VALID_FOR_MS)],
  );
}
