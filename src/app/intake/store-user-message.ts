import type { Database, Transaction } from '../db/transaction.ts';
import type { ClaimedEvent } from '../processing/claimed-event.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { IntakeContext } from './intake-context.ts';

export type NewUserMessage = { id: string; text: string | null; imageKey: string | null; partIndex: number };

export type StoredUserMessage = { id: string; imageKey: string | null; hasReply: boolean };

export async function runStoreStage(context: IntakeContext, message: NewUserMessage): Promise<StoredUserMessage> {
  const { dependencies, stages, event, sender } = context;
  await stages.runStage({
    isDone: (transaction) => hasUserMessage(transaction, event, message.partIndex),
    write: (transaction) => storeUserMessage(transaction, event, sender, message),
  });
  const stored = await findUserMessage(dependencies.database, event, message.partIndex);
  if (!stored) throw new Error(`the message of part ${message.partIndex} of event ${event.id} was not stored`);
  return stored;
}

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
  message: NewUserMessage,
): Promise<void> {
  await transaction.query(
    `INSERT INTO messages (id, workspace_id, user_id, author, text, image_key, inbound_event_id, event_part)
     VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)
     ON CONFLICT (inbound_event_id, event_part) DO NOTHING`,
    [message.id, sender.workspaceId, sender.userId, message.text, message.imageKey, event.id, message.partIndex],
  );
}

export async function findUserMessage(
  database: Database,
  event: ClaimedEvent,
  partIndex: number,
): Promise<StoredUserMessage | null> {
  const { rows } = await database.query<{ id: string; image_key: string | null; has_reply: boolean }>(
    `SELECT id, image_key, EXISTS (SELECT 1 FROM messages reply WHERE reply.reply_to = messages.id) AS has_reply
     FROM messages WHERE inbound_event_id = $1 AND event_part = $2`,
    [event.id, partIndex],
  );
  const [row] = rows;
  return row ? { id: row.id, imageKey: row.image_key, hasReply: row.has_reply } : null;
}

export async function storeBotReply(
  transaction: Transaction,
  userMessageId: string,
  reply: { text: string; kind: 'saved' | 'answer' },
): Promise<void> {
  await transaction.query(
    `INSERT INTO messages (workspace_id, user_id, author, text, reply_to, reply_kind, submission_status)
     SELECT workspace_id, user_id, 'bot', $2, id, $3, 'accepted' FROM messages WHERE id = $1
     ON CONFLICT (reply_to, reply_kind) DO NOTHING`,
    [userMessageId, reply.text, reply.kind],
  );
}

export async function setSubmissionStatus(
  transaction: Transaction,
  userMessageId: string,
  status: 'accepted' | 'unresolved' | 'duplicate',
): Promise<void> {
  await transaction.query('UPDATE messages SET submission_status = $2 WHERE id = $1', [userMessageId, status]);
}
