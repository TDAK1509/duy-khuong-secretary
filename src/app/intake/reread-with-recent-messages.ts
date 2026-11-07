import type { Photo } from '../../services/storage/photo-storage.ts';
import { readSentAt } from '../processing/claimed-event.ts';
import { findRecentMessages, type RecentMessages, type RecentPhoto } from './find-recent-messages.ts';
import type { IntakeContext } from './intake-context.ts';
import { wrapRecentMessages } from './intake-texts.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import type { ReadAttempt } from '../reading/reading.ts';
import { readMessage } from './read-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';

export type RereadPhoto = RecentPhoto & { content: Photo };

export type Reread = { attempt: ReadAttempt; plan: ReplyPlan; photo: RereadPhoto | null };

export async function rereadWithRecentMessages(context: IntakeContext, message: { id: string; text: string }): Promise<Reread | null> {
  const recent = await findRecentMessagesOf(context, message.id);
  if (recent.texts.length === 0 && recent.photo === null) return null;
  const photo = await loadRecentPhoto(context, recent.photo);
  const text = wrapRecentMessages([...recent.texts, message.text]);
  const attempt = await readMessage(context, { text, photo: photo?.content ?? null });
  return { attempt, plan: planReply(attempt, photo !== null), photo };
}

function findRecentMessagesOf(context: IntakeContext, messageId: string): Promise<RecentMessages> {
  return findRecentMessages(context.dependencies.database, context.sender, { id: messageId, sentAt: readSentAt(context.event) });
}

export async function rereadPhotoWithRecentTexts(
  context: IntakeContext,
  message: { id: string; text: string | null; photo: Photo },
): Promise<Reread | null> {
  const recent = await findRecentMessagesOf(context, message.id);
  if (recent.texts.length === 0) return null;
  const caption = message.text === null ? [] : [message.text];
  const attempt = await readMessage(context, { text: wrapRecentMessages([...recent.texts, ...caption]), photo: message.photo });
  return { attempt, plan: planReply(attempt, true), photo: null };
}

async function loadRecentPhoto(context: IntakeContext, photo: RecentPhoto | null): Promise<RereadPhoto | null> {
  if (photo === null) return null;
  const content = await requirePhotoStorage(context).get(photo.imageKey);
  return content && { ...photo, content };
}
