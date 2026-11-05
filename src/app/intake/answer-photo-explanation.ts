import type { Photo } from '../../services/storage/photo-storage.ts';
import { answerWithChat } from '../admin-chat/answer-with-chat.ts';
import type { Transaction } from '../db/transaction.ts';
import { readSentAt } from '../processing/claimed-event.ts';
import { askNextWaitingPhoto } from './ask-next-photo.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import { findEarlierAnswers } from './find-earlier-answers.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { wrapExplanation } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { planAnswer, planUnreadAnswer, type AnswerPlan, type ReplyAnswer, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './read-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';
import { isReplied } from './run-reply-stage.ts';
import { saveReplyOnPhoto } from './save-on-photo.ts';
import { isQuestionPending, markQuestionAboutPhoto, setSubmissionStatus, type SubmissionStatus } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

type Explanation = { id: string; text: string };

type PhotoToRead = { asked: AskedPhoto; photo: Photo };

type Answered = { explanation: Explanation; asked: AskedPhoto };

export async function answerPhotoExplanation(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
): Promise<IntakeOutcome> {
  const photo = await requirePhotoStorage(context).get(asked.imageKey);
  const answer = await readAnswer(context, explanation, asked, photo);
  await runAnswerStage(context, { explanation, asked }, answer);
  if (await isQuestionPending(context.dependencies.database, explanation.id)) {
    await answerWithChat(context, { ...explanation, photo });
  }
  return { kind: 'replied' };
}

async function runAnswerStage(context: IntakeContext, answered: Answered, answer: AnswerPlan): Promise<void> {
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, answered.explanation.id),
    write: (transaction) => saveAnswer(transaction, context, answered, answer),
  });
}

async function readAnswer(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
  photo: Photo | null,
): Promise<AnswerPlan> {
  if (photo === null) return planUnreadAnswer();
  const first = await readAndPlanAnswer(context, { asked, photo }, [explanation.text]);
  if (!isWeakAnswer(first)) return first;
  const second = await rereadWithEarlierAnswers(context, explanation, { asked, photo });
  return second !== null && isSavedOrQuestion(second) ? second : first;
}

async function rereadWithEarlierAnswers(
  context: IntakeContext,
  explanation: Explanation,
  target: PhotoToRead,
): Promise<AnswerPlan | null> {
  const earlier = await findEarlierAnswers(context.dependencies.database, context.sender, {
    photoId: target.asked.id,
    currentTextId: explanation.id,
    currentSentAt: readSentAt(context.event),
  });
  return earlier.length === 0 ? null : readAndPlanAnswer(context, target, [...earlier, explanation.text]);
}

async function readAndPlanAnswer(context: IntakeContext, { asked, photo }: PhotoToRead, texts: string[]): Promise<AnswerPlan> {
  const attempt = await readMessage(context, { text: wrapExplanation(texts.join('\n')), photo });
  return planAnswer(attempt, asked, context.sender.role);
}

function isWeakAnswer(answer: AnswerPlan): boolean {
  return answer.kind === 'reply' && (answer.photoAfter === 'asked_again' || answer.photoAfter === 'unresolved');
}

function isSavedOrQuestion(answer: AnswerPlan): boolean {
  return answer.kind === 'question' || answer.reply.situation === 'saved';
}

async function saveAnswer(
  transaction: Transaction,
  context: IntakeContext,
  answered: Answered,
  answer: AnswerPlan,
): Promise<void> {
  if (answer.kind === 'question') return saveQuestion(transaction, context, answered);
  const target = { textId: answered.explanation.id, photo: answered.asked };
  const reply = await saveReplyOnPhoto(transaction, context, target, answer.reply);
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
