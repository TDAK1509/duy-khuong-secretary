import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './read-message.ts';
import { rereadWithRecentMessages, type RereadPhoto, type Reread } from './reread-with-recent-messages.ts';
import { isReplied, runReplyStage } from './run-reply-stage.ts';
import { saveRereadOnPhoto } from './save-on-photo.ts';
import { isQuestionPending } from './store-user-message.ts';

export type MessageToRead = { id: string; text: string | null; photo: Photo | null };

export async function replyToMessage(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const firstPlan = planReply(await readMessage(context, message), message.photo !== null);
  const reread = await rereadUnclearText(context, message, firstPlan);
  if (reread?.photo) return replyOnRereadPhoto(context, message, reread.plan, reread.photo);
  const plan = reread?.plan ?? firstPlan;
  if (context.sender.role === 'admin' && isForChat(plan, message.text)) {
    await answerWithChat(context, message);
    return { kind: 'replied' };
  }
  await runReplyStage(context, message.id, plan);
  if (await isQuestionPending(context.dependencies.database, message.id)) await answerWithChat(context, message);
  return { kind: 'replied' };
}

async function rereadUnclearText(context: IntakeContext, message: MessageToRead, plan: ReplyPlan): Promise<Reread | null> {
  if (!plan.isUnclear || message.photo !== null || message.text === null) return null;
  const reread = await rereadWithRecentMessages(context, { id: message.id, text: message.text });
  return reread?.plan.situation === 'saved' ? reread : null;
}

async function replyOnRereadPhoto(
  context: IntakeContext,
  message: MessageToRead,
  plan: ReplyPlan,
  photo: RereadPhoto,
): Promise<IntakeOutcome> {
  const target = { textId: message.id, photo };
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, message.id),
    write: (transaction) => saveRereadOnPhoto(transaction, context, target, plan),
  });
  if (await isQuestionPending(context.dependencies.database, message.id)) {
    await answerWithChat(context, { ...message, photo: photo.content });
  }
  return { kind: 'replied' };
}

function isForChat({ situation }: ReplyPlan, text: string | null): boolean {
  return situation === 'no_work_data' || (situation === 'needs_explanation' && text !== null);
}
