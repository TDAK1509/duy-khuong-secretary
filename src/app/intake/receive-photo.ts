import { randomUUID } from 'node:crypto';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import { detectImageType } from './detect-image-type.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import type { IntakePart } from './intake-parts.ts';
import { PHOTO_RECEIVED_TEXT } from './intake-texts.ts';
import { runStoreStage } from './store-user-message.ts';

const MAX_PHOTO_BYTES = 5_000_000;

export type PhotoPart = IntakePart & { imageUrl: string };

export async function receivePhoto(context: IntakeContext, part: PhotoPart): Promise<IntakeOutcome> {
  const { channel } = context.dependencies;
  const download = await channel.downloadAttachment(part.imageUrl, MAX_PHOTO_BYTES);
  if (!download.ok) throw new Error('the photo was not downloaded');
  const image = detectImageType(download.bytes);
  if (image === null) throw new Error('the file is not a photo');
  const id = randomUUID();
  const imageKey = `${context.sender.workspaceId}/${id}.${image.extension}`;
  const stored = await runStoreStage(context, { id, text: part.text, imageKey, partIndex: part.index });
  await requirePhotoStorage(context).put(stored.imageKey ?? imageKey, image.photo);
  return { kind: 'stored', messageId: stored.id, replyText: PHOTO_RECEIVED_TEXT };
}

function requirePhotoStorage(context: IntakeContext): PhotoStorage {
  const { photoStorage } = context.dependencies;
  if (photoStorage === null) throw new Error('photo storage is not configured');
  return photoStorage;
}
