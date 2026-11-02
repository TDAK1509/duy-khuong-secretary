import type { ChatService } from '../../services/chat/chat-service.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueReply } from '../intake/enqueue-reply.ts';
import type { IntakeContext } from '../intake/intake-context.ts';
import type { MessageToRead } from '../intake/reply-to-message.ts';
import { setSubmissionStatus, storeBotReply } from '../intake/store-user-message.ts';

export async function answerWithChat(context: IntakeContext, message: MessageToRead): Promise<void> {
  const result = await requireChat(context).respond({
    system: '',
    turns: [{ role: 'user', text: message.text, image: message.photo }],
    tools: [],
  });
  const answer = result.ok && result.reply.kind === 'text' ? result.reply.text : '';
  await context.stages.runStage({
    isDone: (transaction) => hasAnswer(transaction, message.id),
    write: (transaction) => publishAnswer(transaction, context, message.id, answer),
  });
}

function requireChat(context: IntakeContext): ChatService {
  const { chat } = context.dependencies;
  if (chat === null) throw new Error('the chat service is not configured');
  return chat;
}

async function hasAnswer(transaction: Transaction, messageId: string): Promise<boolean> {
  const rows = await transaction.query(`SELECT 1 FROM messages WHERE reply_to = $1 AND reply_kind = 'answer'`, [messageId]);
  return rows.length > 0;
}

async function publishAnswer(transaction: Transaction, context: IntakeContext, messageId: string, answer: string): Promise<void> {
  await storeBotReply(transaction, messageId, { text: answer, kind: 'answer' });
  await setSubmissionStatus(transaction, messageId, 'accepted');
  await enqueueReply(transaction, context, answer, context.sender.membershipId);
}
