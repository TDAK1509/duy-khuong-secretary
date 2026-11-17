import { isInternalUser } from '../internal-admin/is-internal-user.ts';
import { generateSecretToken, hashSecretToken } from '../internal-admin/secret-token.ts';
import { NOT_INTERNAL_TEXT } from '../internal-admin/internal-admin-texts.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import { MCP_TOKEN_EXPLANATION, MCP_TOKEN_RATE_LIMITED_TEXT } from './internal-mcp-texts.ts';
import { MCP_TOKEN_LIFETIME_MS, MCP_TOKEN_RATE_LIMIT_MS } from './internal-mcp-limits.ts';
import type { Transaction } from '../db/transaction.ts';
import type { Reply } from '../delivery/reply.ts';

const MCP_TOKEN_COMMAND = 'lay token mcp';

export function isMcpTokenCommand(text: string): boolean {
  return toAccentFreeForm(text) === MCP_TOKEN_COMMAND;
}

export async function answerMcpTokenCommand(transaction: Transaction, userId: string, now: Date): Promise<Reply> {
  if (!(await isInternalUser(transaction, userId))) return { text: NOT_INTERNAL_TEXT };
  const rateLimited = await isWithinRateLimit(transaction, userId, now);
  if (rateLimited) return { text: MCP_TOKEN_RATE_LIMITED_TEXT };
  const token = generateSecretToken();
  await rotateMcpToken(transaction, { userId, token, now });
  return { text: MCP_TOKEN_EXPLANATION, followUpText: token };
}

async function isWithinRateLimit(transaction: Transaction, userId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - MCP_TOKEN_RATE_LIMIT_MS);
  const [row] = await transaction.query<{ user_id: string }>(
    'SELECT user_id FROM internal_mcp_tokens WHERE user_id = $1 AND created_at >= $2',
    [userId, cutoff],
  );
  return row !== undefined;
}

type TokenRotation = { userId: string; token: string; now: Date };

async function rotateMcpToken(transaction: Transaction, { userId, token, now }: TokenRotation): Promise<void> {
  await transaction.query('DELETE FROM internal_mcp_tokens WHERE user_id = $1', [userId]);
  await transaction.query(
    'INSERT INTO internal_mcp_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashSecretToken(token), new Date(now.getTime() + MCP_TOKEN_LIFETIME_MS)],
  );
}
