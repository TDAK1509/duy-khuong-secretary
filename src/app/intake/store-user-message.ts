import type { Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { IntakeSender } from './find-intake-sender.ts';

export type IntakePart = { index: number; text: string | null; imageKey: string | null };

export async function hasUserMessage(transaction: Transaction, event: ClaimedEvent, partIndex: number): Promise<boolean> {
  const rows = await transaction.query(
    'SELECT 1 FROM messages WHERE inbound_event_id = $1 AND event_part = $2',
    [event.id, partIndex],
  );
  return rows.length > 0;
}

export async function storeUserMessage(
  transaction: Transaction,
  event: ClaimedEvent,
  sender: IntakeSender,
  part: IntakePart,
): Promise<void> {
  await transaction.query(
    `INSERT INTO messages (workspace_id, user_id, author, text, image_key, inbound_event_id, event_part)
     VALUES ($1, $2, 'user', $3, $4, $5, $6)
     ON CONFLICT (inbound_event_id, event_part) DO NOTHING`,
    [sender.workspaceId, sender.userId, part.text, part.imageKey, event.id, part.index],
  );
}

export async function findUserMessageId(transaction: Transaction, event: ClaimedEvent, partIndex: number): Promise<string> {
  const [message] = await transaction.query<{ id: string }>(
    'SELECT id FROM messages WHERE inbound_event_id = $1 AND event_part = $2',
    [event.id, partIndex],
  );
  if (!message) throw new Error(`the message of part ${partIndex} of event ${event.id} is missing`);
  return message.id;
}

export async function storeBotReply(transaction: Transaction, userMessageId: string, text: string): Promise<boolean> {
  const stored = await transaction.query(
    `INSERT INTO messages (workspace_id, user_id, author, text, reply_to, reply_kind, submission_status)
     SELECT workspace_id, user_id, 'bot', $2, id, 'answer', 'accepted' FROM messages WHERE id = $1
     ON CONFLICT (reply_to, reply_kind) DO NOTHING
     RETURNING id`,
    [userMessageId, text],
  );
  return stored.length > 0;
}
