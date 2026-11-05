import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';

const DISCONNECT_COMMAND = 'ngat chatgpt';
const NOT_CONNECTED_TEXT = 'Bạn chưa kết nối ChatGPT.';

export function isDisconnectCommand(text: string): boolean {
  return toAccentFreeForm(text) === DISCONNECT_COMMAND;
}

export async function answerDisconnectCommand(transaction: Transaction, userId: string): Promise<Reply> {
  const disconnected = await deleteConnectionsOf(transaction, userId);
  if (disconnected === 0) return { text: NOT_CONNECTED_TEXT };
  return { text: `Đã ngắt ${disconnected} kết nối ChatGPT của bạn.` };
}

async function deleteConnectionsOf(transaction: Transaction, userId: string): Promise<number> {
  const deleted = await transaction.query(
    `DELETE FROM chatgpt_connections
     WHERE membership_id IN (SELECT id FROM memberships WHERE user_id = $1)
     RETURNING id`,
    [userId],
  );
  return deleted.length;
}
