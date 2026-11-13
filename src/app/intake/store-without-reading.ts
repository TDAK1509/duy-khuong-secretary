import { randomUUID } from 'node:crypto';
import type { IntakeContext } from './intake-context.ts';
import type { IntakePart } from './intake-parts.ts';
import { downloadImage, loadKeptPhoto, storeMessageAndPhoto, type PhotoPart } from './receive-photo.ts';
import { findUserMessage, runStoreStage } from './store-user-message.ts';

export async function storeWithoutReading(context: IntakeContext, part: IntakePart): Promise<void> {
  if (part.imageUrl === null) {
    await runStoreStage(context, { id: randomUUID(), text: part.text, imageKey: null, partIndex: part.index });
    return;
  }
  await storePhotoWithoutReading(context, { ...part, imageUrl: part.imageUrl });
}

async function storePhotoWithoutReading(context: IntakeContext, part: PhotoPart): Promise<void> {
  const existing = await findUserMessage(context.dependencies.database, context.event, part.index);
  if (existing && (await loadKeptPhoto(context, existing)) !== null) return;
  const downloaded = await downloadImage(context, part.imageUrl);
  if (downloaded.ok) await storeMessageAndPhoto(context, part, downloaded.image);
}
