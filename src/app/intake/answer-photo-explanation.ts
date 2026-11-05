import type { Transaction } from '../db/transaction.ts';
import { insertRecords } from '../records/insert-records.ts';
import { askNextWaitingPhoto } from './ask-next-photo.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { wrapExplanation } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { planAnswer, type AnswerPlan, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './reply-to-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';
import { isReplied, rejectDuplicates } from './run-reply-stage.ts';
import { setSubmissionStatus, storeBotReply } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

export type Explanation = { id: string; text: string };

type Answered = { explanation: Explanation; asked: AskedPhoto };

export async function answerPhotoExplanation(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
): Promise<IntakeOutcome> {
  const photo = await requirePhotoStorage(context).get(asked.imageKey);
  const decision = await readMessage(context, { text: wrapExplanation(explanation.text), photo });
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, explanation.id),
    write: (transaction) => saveAnswer(transaction, context, { explanation, asked }, planAnswer(decision, asked)),
  });
  return { kind: 'replied' };
}

async function saveAnswer(
  transaction: Transaction,
  context: IntakeContext,
  answered: Answered,
  answer: AnswerPlan,
): Promise<void> {
  const reply = await rejectDuplicates(transaction, context.sender.workspaceId, answer.reply);
  await saveReplyToExplanation(transaction, context, answered, reply);
  const photoStatus = answer.photoAfter === 'same_as_reply' ? reply.status : answer.photoAfter;
  await setSubmissionStatus(transaction, answered.asked.id, photoStatus);
  await enqueueReplyToMessage(transaction, context, answered.asked.id, reply.replyText);
  if (photoStatus !== 'asked_again') await endWait(transaction, context, answered.asked, reply.replyText);
}

async function saveReplyToExplanation(
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

async function endWait(transaction: Transaction, context: IntakeContext, asked: AskedPhoto, replyText: string): Promise<void> {
  await notifyAdminsOfPhoto(transaction, context, asked.id, replyText);
  await askNextWaitingPhoto(transaction, context);
}
