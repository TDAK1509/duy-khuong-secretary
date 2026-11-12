import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { QuotedMessage } from '../delivery/claimed-message.ts';
import { enqueueImage } from '../delivery/enqueue-image.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import { splitText } from '../delivery/split-text.ts';
import type { Transaction } from '../db/transaction.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';
import type { SourceCard } from '../admin-chat/source-cards.ts';
import type { IntakeContext } from './intake-context.ts';
import { hasSeveralPhotos } from './intake-parts.ts';

export type ReplyOptions = { adminMembershipId?: string | undefined; quote?: QuotedMessage };

export async function enqueueReply(
  transaction: Transaction,
  context: IntakeContext,
  text: string,
  { adminMembershipId, quote }: ReplyOptions = {},
): Promise<void> {
  const { dependencies } = context;
  await enqueueText(transaction, {
    to: findRecipient(context),
    text,
    maxTextLength: dependencies.channel.maxTextLength,
    availableAt: dependencies.clock.now(),
    ...(adminMembershipId !== undefined && { adminMembershipId }),
    ...(quote !== undefined && { quote }),
  });
}

export async function enqueueSourceCard(
  transaction: Transaction,
  context: IntakeContext,
  { text, quote }: SourceCard,
  adminMembershipId: string | undefined,
): Promise<void> {
  const [firstPart = '', ...otherParts] = splitText(text, context.dependencies.channel.maxTextLength);
  await enqueueReply(transaction, context, firstPart, { adminMembershipId, quote });
  for (const part of otherParts) await enqueueReply(transaction, context, part, { adminMembershipId });
}

export async function enqueueRefusal(transaction: Transaction, context: IntakeContext, text: string): Promise<void> {
  if (hasSeveralPhotos(context.event)) return enqueueReply(transaction, context, text);
  const messageId = await findExternalEventId(transaction, context.event.id);
  return enqueueReply(transaction, context, text, { quote: { messageId } });
}

async function findExternalEventId(transaction: Transaction, eventId: string): Promise<string> {
  const [event] = await transaction.query<{ external_event_id: string }>(
    'SELECT external_event_id FROM inbound_events WHERE id = $1',
    [eventId],
  );
  if (!event) throw new Error(`inbound event ${eventId} not found`);
  return event.external_event_id;
}

export async function enqueueReplyToMessage(
  transaction: Transaction,
  context: IntakeContext,
  messageId: string,
  text: string,
): Promise<void> {
  const photo = await findStoredPhoto(transaction, messageId);
  if (photo === null) return enqueueReply(transaction, context, text);
  if (photo.eventPhotoCount > 1) return enqueueReplyAsPhoto(transaction, context, photo.imageKey, text);
  return enqueueReply(transaction, context, text, { quote: { messageId: photo.eventId, fallbackPhotoKey: photo.imageKey } });
}

async function enqueueReplyAsPhoto(transaction: Transaction, context: IntakeContext, photoKey: string, text: string): Promise<void> {
  const { dependencies } = context;
  for (const part of splitText(text, dependencies.channel.maxTextLength)) {
    await enqueueImage(transaction, {
      to: findRecipient(context),
      photoKey,
      text: part,
      availableAt: dependencies.clock.now(),
    });
  }
}

type StoredPhoto = { imageKey: string; eventId: string; eventPhotoCount: number };

async function findStoredPhoto(transaction: Transaction, messageId: string): Promise<StoredPhoto | null> {
  const [photo] = await transaction.query<{ image_key: string; external_event_id: string; photo_count: number }>(
    `SELECT message.image_key, event.external_event_id, jsonb_array_length(event.payload -> 'image_urls') AS photo_count
     FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE message.id = $1 AND message.image_key IS NOT NULL`,
    [messageId],
  );
  return photo
    ? { imageKey: photo.image_key, eventId: photo.external_event_id, eventPhotoCount: photo.photo_count }
    : null;
}

export async function enqueueReplyPhotos(
  transaction: Transaction,
  context: IntakeContext,
  photos: AttachablePhoto[],
  adminMembershipId: string | undefined,
): Promise<void> {
  for (const photo of photos) {
    await enqueueImage(transaction, {
      to: findRecipient(context),
      photoKey: photo.imageKey,
      availableAt: context.dependencies.clock.now(),
      ...(adminMembershipId !== undefined && { adminMembershipId }),
    });
  }
}

function findRecipient({ event }: IntakeContext): ChannelRecipient {
  return { channel: event.channel, accountId: event.accountId, externalUserId: event.externalUserId };
}
