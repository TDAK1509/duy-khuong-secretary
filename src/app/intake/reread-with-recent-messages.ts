import { findRecentMessages, type RecentPhoto } from './find-recent-messages.ts';
import type { IntakeContext } from './intake-context.ts';
import { wrapRecentMessages } from './intake-texts.ts';
import { planReply, type ReplyPlan } from './plan-reply.ts';
import { readMessage } from './reply-to-message.ts';
import { requirePhotoStorage } from './require-photo-storage.ts';

export type RecentReading = { plan: ReplyPlan; photo: RecentPhoto | null };

export async function rereadWithRecentMessages(
  context: IntakeContext,
  message: { id: string; text: string },
): Promise<RecentReading | null> {
  const recent = await findRecentMessages(context.dependencies.database, context.sender, message);
  if (recent.texts.length === 0 && recent.photo === null) return null;
  const photo = recent.photo && (await requirePhotoStorage(context).get(recent.photo.imageKey));
  const decision = await readMessage(context, { text: wrapRecentMessages([...recent.texts, message.text]), photo });
  return { plan: planReply(decision, photo !== null), photo: recent.photo };
}
