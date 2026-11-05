import type { Transaction } from '../db/transaction.ts';
import type { IntakeContext } from './intake-context.ts';
import { ASK_LATER_TEXT } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import { choosePhotoQuestion, enqueuePhotoQuestion, type PhotoQuestion } from './photo-question.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { setSubmissionStatus, storeBotReply, storeCodeChoice } from './store-user-message.ts';
import { endExpiredWaits, hasOtherWaitingPhoto } from './waiting-photos.ts';

const ASK_LATER_QUESTION: PhotoQuestion = { text: ASK_LATER_TEXT, candidates: [] };

export async function placeUnclearPhoto(
  transaction: Transaction,
  context: IntakeContext,
  photoId: string,
  askPlan: ReplyPlan,
): Promise<void> {
  await endExpiredWaits(transaction, context.sender, context.dependencies.clock.now());
  const isWaitingForItsTurn = await hasOtherWaitingPhoto(transaction, context.sender, photoId);
  const question = isWaitingForItsTurn ? ASK_LATER_QUESTION : choosePhotoQuestion(context.sender.role, askPlan.codeChoice);
  if (askPlan.codeChoice !== null) await storeCodeChoice(transaction, photoId, askPlan.codeChoice);
  if (!isWaitingForItsTurn) await storeBotReply(transaction, photoId, { text: question.text, kind: askPlan.replyKind });
  await setSubmissionStatus(transaction, photoId, askPlan.status);
  await enqueuePhotoQuestion(transaction, context, photoId, question);
  await notifyAdminsOfPhoto(transaction, context, photoId, question.text);
}
