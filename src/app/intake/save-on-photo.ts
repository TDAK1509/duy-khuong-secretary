import type { Transaction } from '../db/transaction.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import { formatReplyWithReadData } from './format-reply-with-read-data.ts';
import type { IntakeContext } from './intake-context.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { saveRecordsAndPapers } from './run-reply-stage.ts';
import { markQuestionPending, setSubmissionStatus, storeBotReply } from './store-user-message.ts';

export type SavedReply = ReplyPlan & { senderText: string };

export type TextOnPhoto = { textId: string; photo: { id: string } };

export async function saveRereadOnPhoto(
  transaction: Transaction,
  context: IntakeContext,
  target: TextOnPhoto,
  plan: ReplyPlan,
): Promise<void> {
  const reply = await saveReplyOnPhoto(transaction, context, target, plan);
  await setSubmissionStatus(transaction, target.photo.id, reply.status);
  await enqueueReplyToMessage(transaction, context, target.photo.id, reply.senderText);
  await notifyAdminsOfPhoto(transaction, context, target.photo.id, reply);
}

export async function saveReplyOnPhoto(
  transaction: Transaction,
  { sender }: IntakeContext,
  { textId, photo }: TextOnPhoto,
  plan: ReplyPlan,
): Promise<SavedReply> {
  const reply = await saveRecordsAndPapers(transaction, sender, photo.id, plan);
  const senderText = formatReplyWithReadData(reply);
  await storeBotReply(transaction, textId, { text: senderText, kind: reply.replyKind });
  await setSubmissionStatus(transaction, textId, reply.status);
  if (reply.saved && reply.asksQuestion && sender.role === 'admin') await markQuestionPending(transaction, textId);
  return { ...reply, senderText };
}
