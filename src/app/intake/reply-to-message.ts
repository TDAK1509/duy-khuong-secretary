import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import { decideReading, type ReadingDecision } from '../reading/decide-reading.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import { rereadWithRecentMessages } from './reread-with-recent-messages.ts';
import { runReplyStage } from './run-reply-stage.ts';
import { isQuestionPending } from './store-user-message.ts';

export type MessageToRead = { id: string; text: string | null; photo: Photo | null };

export function readMessage(context: IntakeContext, message: Pick<MessageToRead, 'text' | 'photo'>): Promise<ReadingDecision> {
  return decideReading(context.readers, {
    system: buildReaderPrompt(context.dependencies.clock.now()),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
}

export async function replyToMessage(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const plan = planReply(await readMessage(context, message), message.photo !== null);
  if (plan.isUnclear && message.photo === null && message.text !== null) {
    await rereadWithRecentMessages(context, { id: message.id, text: message.text });
  }
  if (context.sender.role === 'admin' && isForChat(plan, message.text)) {
    await answerWithChat(context, message);
    return { kind: 'replied' };
  }
  await runReplyStage(context, message.id, plan);
  if (await isQuestionPending(context.dependencies.database, message.id)) await answerWithChat(context, message);
  return { kind: 'replied' };
}

function isForChat({ situation }: ReplyPlan, text: string | null): boolean {
  return situation === 'no_work_data' || (situation === 'needs_explanation' && text !== null);
}
