import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { Transaction } from '../db/transaction.ts';
import { insertRecords } from '../records/insert-records.ts';
import { askNextWaitingPhoto } from './ask-next-photo.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { wrapExplanation } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { planAnswer, planUnreadAnswer, type AnswerPlan, type ReplyAnswer, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './reply-to-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';
import { isReplied, rejectDuplicates } from './run-reply-stage.ts';
import { isQuestionPending, markQuestionAboutPhoto, setSubmissionStatus, storeBotReply, type SubmissionStatus } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

type Explanation = { id: string; text: string };

type Answered = { explanation: Explanation; asked: AskedPhoto };

export async function answerPhotoExplanation(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
): Promise<IntakeOutcome> {
  const photo = await requirePhotoStorage(context).get(asked.imageKey);
  const answer = await readAnswer(context, explanation, asked, photo);
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, explanation.id),
    write: (transaction) => saveAnswer(transaction, context, { explanation, asked }, answer),
  });
  if (await isQuestionPending(context.dependencies.database, explanation.id)) {
    await answerWithChat(context, { ...explanation, photo });
  }
  return { kind: 'replied' };
}

async function readAnswer(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
  photo: Photo | null,
): Promise<AnswerPlan> {
  if (photo === null) return planUnreadAnswer();
  return planAnswer(await readMessage(context, { text: wrapExplanation(explanation.text), photo }), asked, context.sender.role);
}

async function saveAnswer(
  transaction: Transaction,
  context: IntakeContext,
  answered: Answered,
  answer: AnswerPlan,
): Promise<void> {
  if (answer.kind === 'question') return saveQuestion(transaction, context, answered);
  const reply = await rejectDuplicates(transaction, context.sender.workspaceId, answer.reply);
  await saveRecordsAndReply(transaction, context, answered, reply);
  if (reply.saved && reply.asksQuestion && context.sender.role === 'admin') {
    await markQuestionAboutPhoto(transaction, answered.explanation.id, answered.asked.imageKey);
  }
  const photoStatus = findPhotoStatus(answer, reply);
  if (photoStatus !== null) await setSubmissionStatus(transaction, answered.asked.id, photoStatus);
  await enqueueReplyToMessage(transaction, context, answered.asked.id, reply.replyText);
  if (endsWait(answer)) await endWait(transaction, context, answered.asked, reply.replyText);
}

async function saveQuestion(transaction: Transaction, context: IntakeContext, { explanation, asked }: Answered): Promise<void> {
  await setSubmissionStatus(transaction, asked.id, 'accepted');
  await markQuestionAboutPhoto(transaction, explanation.id, asked.imageKey);
  await askNextWaitingPhoto(transaction, context);
}

async function saveRecordsAndReply(
  transaction: Transaction,
  { sender }: IntakeContext,
  { explanation, asked }: Answered,
  reply: ReplyPlan,
): Promise<void> {
  const photo = { id: asked.id, workspaceId: sender.workspaceId, userId: sender.userId };
  if (reply.saved) await insertRecords(transaction, photo, reply.saved.readBy, reply.saved.records);
  await storeBotReply(transaction, explanation.id, { text: reply.replyText, kind: reply.replyKind });
  await setSubmissionStatus(transaction, explanation.id, reply.status);
}

function findPhotoStatus({ photoAfter }: ReplyAnswer, reply: ReplyPlan): SubmissionStatus | null {
  if (photoAfter === 'unchanged') return null;
  return photoAfter === 'same_as_reply' ? reply.status : photoAfter;
}

function endsWait({ photoAfter }: ReplyAnswer): boolean {
  return photoAfter === 'same_as_reply' || photoAfter === 'unresolved';
}

async function endWait(transaction: Transaction, context: IntakeContext, asked: AskedPhoto, replyText: string): Promise<void> {
  await notifyAdminsOfPhoto(transaction, context, asked.id, replyText);
  await askNextWaitingPhoto(transaction, context);
}
