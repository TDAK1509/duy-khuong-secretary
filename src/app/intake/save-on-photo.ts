import type { Transaction } from '../db/transaction.ts';
import { storeDocuments } from '../documents/store-documents.ts';
import { queueNameProposalToAdmins } from '../name-matches/queue-name-proposal.ts';
import { insertRecords } from '../records/insert-records.ts';
import { enqueueReplyToMessage } from './enqueue-reply.ts';
import { formatReplyForSender } from './format-reply-with-read-data.ts';
import type { IntakeContext } from './intake-context.ts';
import { notifyAdminsOfPhoto } from './notify-admins-of-photo.ts';
import type { ReplyPlan } from './plan-reply.ts';
import { rejectDuplicates } from './run-reply-stage.ts';
import { markQuestionPending, setSubmissionStatus, storeBotReply } from './store-user-message.ts';

export type SavedReply = ReplyPlan & { hasProposedParty: boolean };

export type TextOnPhoto = { textId: string; photo: { id: string } };

export async function saveRereadOnPhoto(
  transaction: Transaction,
  context: IntakeContext,
  target: TextOnPhoto,
  plan: ReplyPlan,
): Promise<void> {
  const reply = await saveReplyOnPhoto(transaction, context, target, plan);
  await setSubmissionStatus(transaction, target.photo.id, reply.status);
  await enqueueReplyToMessage(transaction, context, target.photo.id, formatReplyForSender(reply, context.sender.role));
  await notifyAdminsOfPhoto(transaction, context, target.photo.id, reply);
  if (reply.hasProposedParty) await queueNameProposalToAdmins(transaction, context);
}

export async function saveReplyOnPhoto(
  transaction: Transaction,
  context: IntakeContext,
  target: TextOnPhoto,
  plan: ReplyPlan,
): Promise<SavedReply> {
  const { sender } = context;
  const reply = await rejectDuplicates(transaction, sender.workspaceId, plan);
  await saveRecordsAndReply(transaction, context, target, reply);
  const hasProposedParty = await storeDocuments(transaction, { id: target.photo.id, workspaceId: sender.workspaceId }, plan, reply.saved !== null);
  if (reply.saved && reply.asksQuestion && sender.role === 'admin') {
    await markQuestionPending(transaction, target.textId);
  }
  return { ...reply, hasProposedParty };
}

async function saveRecordsAndReply(
  transaction: Transaction,
  { sender }: IntakeContext,
  { textId, photo }: TextOnPhoto,
  reply: ReplyPlan,
): Promise<void> {
  const holder = { id: photo.id, workspaceId: sender.workspaceId, userId: sender.userId };
  if (reply.saved) await insertRecords(transaction, holder, reply.saved);
  await storeBotReply(transaction, textId, { text: reply.replyText, kind: reply.replyKind, holdsOtherText: true });
  await setSubmissionStatus(transaction, textId, reply.status);
}
