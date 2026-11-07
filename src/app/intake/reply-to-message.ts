import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import { answerPendingQuestionAfterReply } from './answer-pending-question.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import type { ReadAttempt } from '../reading/reading.ts';
import { asksOnlyAQuestion, planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './read-message.ts';
import { rereadPhotoWithRecentTexts, rereadWithRecentMessages, type RereadPhoto, type Reread } from './reread-with-recent-messages.ts';
import { isReplied, runReplyStage } from './run-reply-stage.ts';
import { saveRereadOnPhoto } from './save-on-photo.ts';
import { logIntake, type LoggedReading } from './log-intake.ts';
import { isQuestionPending } from './store-user-message.ts';

type FirstReading = { attempt: ReadAttempt; plan: ReplyPlan };

export type MessageToRead = { id: string; text: string | null; photo: Photo | null };

export async function replyToMessage(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const attempt = await readMessage(context, message);
  const firstPlan = planReply(attempt, message.photo !== null);
  const reread = await rereadUnclearMessage(context, message, { attempt, plan: firstPlan });
  if (reread?.photo) return replyOnRereadPhoto(context, message, reread.plan, reread.photo);
  return replyWithPlan(context, message, reread ?? { attempt, plan: firstPlan });
}

async function replyWithPlan(context: IntakeContext, message: MessageToRead, { attempt, plan }: FirstReading): Promise<IntakeOutcome> {
  if (isSentToChat(context, plan, message)) {
    logIntake(context, message.id, toLoggedReading({ attempt, plan }), 'admin_chat');
    await answerWithChat(context, message);
    return { kind: 'replied' };
  }
  await runReplyStage(context, message, plan);
  await answerPendingQuestionAfterReply(context, message, toLoggedReading({ attempt, plan }));
  return { kind: 'replied' };
}

function toLoggedReading({ attempt, plan }: FirstReading): LoggedReading {
  return { attempt, situation: plan.situation };
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
  if (!plan.isUnclear) return null;
  const reread = await rereadPhotoWithRecentTexts(context, message);
  return reread?.plan.situation === 'saved' ? reread : null;
}

async function rereadUnclearText(context: IntakeContext, message: MessageToRead, first: FirstReading): Promise<Reread | null> {
  if (message.text === null || !isRereadable(context, message, first)) return null;
  const reread = await rereadWithRecentMessages(context, { id: message.id, text: message.text });
  return reread?.plan.situation === 'saved' ? reread : null;
}

function isRereadable({ sender }: IntakeContext, { photo }: MessageToRead, { attempt, plan }: FirstReading): boolean {
  if (!plan.isUnclear || photo !== null) return false;
  return !(sender.role === 'admin' && asksOnlyAQuestion(attempt));
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
    await answerWithChat(context, message);
  }
  return { kind: 'replied' };
}

function isSentToChat({ sender }: IntakeContext, { situation }: ReplyPlan, { photo }: MessageToRead): boolean {
  return sender.role === 'admin' && photo === null && situation === 'no_work_data';
}
