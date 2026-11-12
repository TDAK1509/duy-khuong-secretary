import type { Transaction } from '../db/transaction.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import type { IntakeContext } from './intake-context.ts';
import { ASK_EXPLANATION_TEXT, ASK_LATER_TEXT } from './intake-texts.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { setSubmissionStatus, storeBotReply } from './store-user-message.ts';
import { endExpiredWaits, hasOtherWaitingPhoto } from './waiting-photos.ts';

export async function placeUnclearPhoto(
  transaction: Transaction,
  context: IntakeContext,
  photoId: string,
  askPlan: ReplyPlan,
): Promise<void> {
  await endExpiredWaits(transaction, context.sender, context.dependencies.clock.now());
  const isWaitingForItsTurn = await hasOtherWaitingPhoto(transaction, context.sender, photoId);
  const text = isWaitingForItsTurn ? ASK_LATER_TEXT : ASK_EXPLANATION_TEXT;
  if (!isWaitingForItsTurn) await storeBotReply(transaction, photoId, { text, kind: askPlan.replyKind, holdsOtherText: true });
  await setSubmissionStatus(transaction, photoId, askPlan.status);
  await enqueueReplyToMessage(transaction, context, photoId, text);
  await notifyAdminsOfPhoto(transaction, context, photoId, { replyText: text, saved: null });
}
