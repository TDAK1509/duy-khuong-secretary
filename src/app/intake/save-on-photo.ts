import type { Transaction } from '../db/transaction.ts';
import { storeDocuments } from '../documents/store-documents.ts';
import { insertRecords } from '../records/insert-records.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import { formatReplyWithReadData } from './format-reply-with-read-data.ts';
import type { IntakeContext } from './intake-context.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { rejectDuplicates } from './run-reply-stage.ts';
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
  context: IntakeContext,
  target: TextOnPhoto,
  plan: ReplyPlan,
): Promise<SavedReply> {
  const { sender } = context;
  const reply = await rejectDuplicates(transaction, sender.workspaceId, plan);
  const senderText = formatReplyWithReadData(reply);
  await saveRecordsAndReply(transaction, context, target, { reply, senderText });
  await storeDocuments(transaction, { id: target.photo.id, workspaceId: sender.workspaceId }, plan, reply.saved !== null, sender);
  if (reply.saved && reply.asksQuestion) await markQuestionPending(transaction, target.textId);
  return { ...reply, senderText };
}

async function saveRecordsAndReply(
  transaction: Transaction,
  { sender }: IntakeContext,
  { textId, photo }: TextOnPhoto,
  { reply, senderText }: { reply: ReplyPlan; senderText: string },
): Promise<void> {
  const holder = { id: photo.id, workspaceId: sender.workspaceId, userId: sender.userId };
  if (reply.saved) await insertRecords(transaction, holder, reply.saved);
  await storeBotReply(transaction, textId, { text: senderText, kind: reply.replyKind, holdsOtherText: reply.saved !== null });
  await setSubmissionStatus(transaction, textId, reply.status);
}
