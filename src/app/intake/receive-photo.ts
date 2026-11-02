import { randomUUID } from 'node:crypto';
import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import { detectImageType, type DetectedImage } from './detect-image-type.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import type { IntakePart } from './intake-parts.ts';
import {
  PHOTO_NOT_DOWNLOADED_TEXT,
  PHOTO_NOT_JPEG_OR_PNG_TEXT,
  PHOTO_RECEIVED_TEXT,
  PHOTO_TOO_LARGE_TEXT,
} from './intake-texts.ts';
import { findUserMessage, runStoreStage, type StoredUserMessage } from './store-user-message.ts';

const MAX_PHOTO_BYTES = 5_000_000;

export type PhotoPart = IntakePart & { imageUrl: string };

export async function receivePhoto(context: IntakeContext, part: PhotoPart): Promise<IntakeOutcome> {
  const existing = await findUserMessage(context.dependencies.database, context.event, part.index);
  if (existing?.hasReply) return { kind: 'already_replied' };
  if (existing && (await hasKeptPhoto(context, existing))) return keptPhotoOutcome(existing);
  const downloaded = await downloadImage(context, part.imageUrl);
  if (!downloaded.ok) return { kind: 'refused', replyText: downloaded.replyText };
  const messageId = await storeMessageAndPhoto(context, part, downloaded.image);
  return { kind: 'stored', messageId, replyText: PHOTO_RECEIVED_TEXT };
}

async function hasKeptPhoto(context: IntakeContext, message: StoredUserMessage): Promise<boolean> {
  if (message.imageKey === null) return false;
  return (await requirePhotoStorage(context).get(message.imageKey)) !== null;
}

function keptPhotoOutcome(message: StoredUserMessage): IntakeOutcome {
  return { kind: 'stored', messageId: message.id, replyText: PHOTO_RECEIVED_TEXT };
}

type Downloaded = { ok: true; image: DetectedImage } | { ok: false; replyText: string };

async function downloadImage(context: IntakeContext, url: string): Promise<Downloaded> {
  const download = await context.dependencies.channel.downloadAttachment(url, MAX_PHOTO_BYTES);
  if (!download.ok) {
    return { ok: false, replyText: download.reason === 'too_large' ? PHOTO_TOO_LARGE_TEXT : PHOTO_NOT_DOWNLOADED_TEXT };
  }
  const image = detectImageType(download.bytes);
  return image === null ? { ok: false, replyText: PHOTO_NOT_JPEG_OR_PNG_TEXT } : { ok: true, image };
}

async function storeMessageAndPhoto(context: IntakeContext, part: PhotoPart, image: DetectedImage): Promise<string> {
  const id = randomUUID();
  const imageKey = `${context.sender.workspaceId}/${id}.${image.extension}`;
  const stored = await runStoreStage(context, { id, text: part.text, imageKey, partIndex: part.index });
  await requirePhotoStorage(context).put(stored.imageKey ?? imageKey, image.photo);
  return stored.id;
}

function requirePhotoStorage(context: IntakeContext): PhotoStorage {
  const { photoStorage } = context.dependencies;
  if (photoStorage === null) throw new Error('photo storage is not configured');
  return photoStorage;
}
