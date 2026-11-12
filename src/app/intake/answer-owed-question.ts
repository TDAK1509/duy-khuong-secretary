import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { ChatMessage } from '../admin-chat/chat-message.ts';
import type { Database } from '../db/transaction.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';

export async function answerOwedQuestion(context: IntakeContext, message: ChatMessage): Promise<IntakeOutcome> {
  const asker = await findCurrentSenderOfMessage(context.dependencies.database, message.id);
  if (asker !== null) await answerWithChat({ ...context, sender: asker }, message);
  return { kind: 'replied' };
}

async function findCurrentSenderOfMessage(database: Database, messageId: string): Promise<IntakeSender | null> {
  const { rows } = await database.query<{ workspace_id: string; user_id: string; membership_id: string; role: IntakeSender['role'] }>(
    `SELECT message.workspace_id, message.user_id, membership.id AS membership_id, membership.role
     FROM messages message
     JOIN memberships membership ON membership.workspace_id = message.workspace_id AND membership.user_id = message.user_id
     WHERE message.id = $1`,
    [messageId],
  );
  const [row] = rows;
  if (!row) return null;
  return { userId: row.user_id, workspaceId: row.workspace_id, membershipId: row.membership_id, role: row.role };
}
