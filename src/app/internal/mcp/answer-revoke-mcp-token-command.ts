import { isInternalUser } from '../admin/is-internal-user.ts';
import { NOT_INTERNAL_TEXT } from '../admin/internal-admin-texts.ts';
import { toAccentFreeForm } from '../../reading/normalize.ts';
import { MCP_TOKEN_REVOKED_TEXT } from './internal-mcp-texts.ts';
import type { Transaction } from '../../db/transaction.ts';
import type { Reply } from '../../delivery/reply.ts';

const REVOKE_MCP_TOKEN_COMMAND = 'thu hoi token mcp';

export function isRevokeMcpTokenCommand(text: string): boolean {
  return toAccentFreeForm(text) === REVOKE_MCP_TOKEN_COMMAND;
}

export async function answerRevokeMcpTokenCommand(transaction: Transaction, userId: string): Promise<Reply> {
  if (!(await isInternalUser(transaction, userId))) return { text: NOT_INTERNAL_TEXT };
  await transaction.query('DELETE FROM internal_mcp_tokens WHERE user_id = $1', [userId]);
  return { text: MCP_TOKEN_REVOKED_TEXT };
}
