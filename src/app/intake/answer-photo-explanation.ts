import type { Transaction } from '../db/transaction.ts';
import { insertRecords } from '../records/insert-records.ts';
import { askNextWaitingPhoto } from './ask-next-photo.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { wrapExplanation } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './reply-to-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';
import { isReplied, rejectDuplicates } from './run-reply-stage.ts';
import { setSubmissionStatus, storeBotReply } from './store-user-message.ts';
import type { AskedPhoto } from './waiting-photos.ts';

export type Explanation = { id: string; text: string };

export async function answerPhotoExplanation(
  context: IntakeContext,
  explanation: Explanation,
  asked: AskedPhoto,
): Promise<IntakeOutcome> {
  const photo = await requirePhotoStorage(context).get(asked.imageKey);
  const decision = await readMessage(context, { text: wrapExplanation(explanation.text), photo });
  await context.stages.runStage({
    isDone: (transaction) => isReplied(transaction, explanation.id),
    write: (transaction) => saveAnswer(transaction, context, { explanation, asked }, planReply(decision)),
  });
  return { kind: 'replied' };
}

type Answered = { explanation: Explanation; asked: AskedPhoto };

async function saveAnswer(
  transaction: Transaction,
  context: IntakeContext,
  { explanation, asked }: Answered,
  plannedReply: ReplyPlan,
): Promise<void> {
  const { sender } = context;
  const plan = await rejectDuplicates(transaction, sender.workspaceId, plannedReply);
  const photo = { id: asked.id, workspaceId: sender.workspaceId, userId: sender.userId };
  if (plan.saved) await insertRecords(transaction, photo, plan.saved.readBy, plan.saved.records);
  await storeBotReply(transaction, explanation.id, { text: plan.replyText, kind: plan.replyKind });
  await setSubmissionStatus(transaction, explanation.id, plan.status);
  await setSubmissionStatus(transaction, asked.id, plan.status);
  await enqueueReplyToMessage(transaction, context, asked.id, plan.replyText);
  await notifyAdminsOfPhoto(transaction, context, asked.id, plan.replyText);
  await askNextWaitingPhoto(transaction, context);
}
