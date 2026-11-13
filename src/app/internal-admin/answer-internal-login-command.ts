import { generateLoginCode } from '../chatgpt/login-code.ts';
import type { Transaction } from '../db/transaction.ts';
import type { Reply } from '../delivery/reply.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { LOGIN_CODE_EXPLANATION } from './internal-admin-texts.ts';

const INTERNAL_LOGIN_COMMAND = 'dang nhap quan tri';

export function isInternalLoginCommand(text: string): boolean {
  return toAccentFreeForm(text) === INTERNAL_LOGIN_COMMAND;
}

export async function answerInternalLoginCommand(transaction: Transaction, userId: string): Promise<Reply | null> {
  if (!(await isInternalUser(transaction, userId))) return null;
  return { text: LOGIN_CODE_EXPLANATION, followUpText: generateLoginCode() };
}

async function isInternalUser(transaction: Transaction, userId: string): Promise<boolean> {
  const [user] = await transaction.query<{ is_internal: boolean }>('SELECT is_internal FROM users WHERE id = $1', [userId]);
  return user?.is_internal === true;
}
