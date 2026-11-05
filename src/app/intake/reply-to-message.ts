import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import type { ReadingDecision } from '../reading/decide-reading.ts';
import { asksOnlyAQuestion, planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './read-message.ts';
import { rereadPhotoWithRecentTexts, rereadWithRecentMessages, type RereadPhoto, type Reread } from './reread-with-recent-messages.ts';
import { isReplied, runReplyStage } from './run-reply-stage.ts';
import { saveRereadOnPhoto } from './save-on-photo.ts';
import { isQuestionPending } from './store-user-message.ts';

type FirstReading = { decision: ReadingDecision; plan: ReplyPlan };

export type MessageToRead = { id: string; text: string | null; photo: Photo | null };

export async function replyToMessage(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const decision = await readMessage(context, message);
  const firstPlan = planReply(decision, message.photo !== null);
  const reread = await rereadUnclearMessage(context, message, { decision, plan: firstPlan });
  if (reread?.photo) return replyOnRereadPhoto(context, message, reread.plan, reread.photo);
  return replyWithPlan(context, message, reread?.plan ?? firstPlan);
}

async function replyWithPlan(context: IntakeContext, message: MessageToRead, plan: ReplyPlan): Promise<IntakeOutcome> {
  if (context.sender.role === 'admin' && isForChat(plan, message.text)) {
    await answerWithChat(context, message);
    return { kind: 'replied' };
  }
  await runReplyStage(context, message.id, plan);
  if (await isQuestionPending(context.dependencies.database, message.id)) await answerWithChat(context, message);
  return { kind: 'replied' };
}

function rereadUnclearMessage(context: IntakeContext, message: MessageToRead, first: FirstReading): Promise<Reread | null> {
  if (message.photo === null) return rereadUnclearText(context, message, first);
  return rereadUnclearPhoto(context, { ...message, photo: message.photo }, first);
}

async function rereadUnclearPhoto(
  context: IntakeContext,
  message: { id: string; text: string | null; photo: Photo },
  { plan }: FirstReading,
): Promise<Reread | null> {
  if (!plan.isUnclear || isForChat(plan, message.text)) return null;
  const reread = await rereadPhotoWithRecentTexts(context, message);
  return reread?.plan.situation === 'saved' ? reread : null;
}

async function rereadUnclearText(context: IntakeContext, message: MessageToRead, first: FirstReading): Promise<Reread | null> {
  if (message.text === null || !isRereadable(context, message, first)) return null;
  const reread = await rereadWithRecentMessages(context, { id: message.id, text: message.text });
  return reread?.plan.situation === 'saved' ? reread : null;
}

function isRereadable({ sender }: IntakeContext, { photo }: MessageToRead, { decision, plan }: FirstReading): boolean {
  if (!plan.isUnclear || photo !== null) return false;
  return !(sender.role === 'admin' && asksOnlyAQuestion(decision));
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
