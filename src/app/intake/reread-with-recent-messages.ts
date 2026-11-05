import type { Photo } from '../../services/storage/photo-storage.ts';
import { readSentAt } from '../processing/claimed-event.ts';
import { findRecentMessages, type RecentPhoto } from './find-recent-messages.ts';
import type { IntakeContext } from './intake-context.ts';
import { wrapRecentMessages } from './intake-texts.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './read-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';

export type RereadPhoto = RecentPhoto & { content: Photo };

export type Reread = { plan: ReplyPlan; photo: RereadPhoto | null };

export async function rereadWithRecentMessages(context: IntakeContext, message: { id: string; text: string }): Promise<Reread | null> {
  const recent = await findRecentMessages(context.dependencies.database, context.sender, { id: message.id, sentAt: readSentAt(context.event) });
  if (recent.texts.length === 0 && recent.photo === null) return null;
  const photo = await loadRecentPhoto(context, recent.photo);
  const text = wrapRecentMessages([...recent.texts, message.text]);
  const decision = await readMessage(context, { text, photo: photo?.content ?? null });
  return { plan: planReply(decision, photo !== null), photo };
}

async function loadRecentPhoto(context: IntakeContext, photo: RecentPhoto | null): Promise<RereadPhoto | null> {
  if (photo === null) return null;
  const content = await requirePhotoStorage(context).get(photo.imageKey);
  return content && { ...photo, content };
}
