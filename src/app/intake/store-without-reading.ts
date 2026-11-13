import type { IntakeContext } from './intake-context.ts';
import type { IntakePart } from './intake-parts.ts';
import { downloadImage, storeMessageAndPhoto } from './receive-photo.ts';
import { findUserMessage } from './store-user-message.ts';

export async function storeWithoutReading(context: IntakeContext, part: IntakePart): Promise<void> {
  if (part.imageUrl === null) return;
  if ((await findUserMessage(context.dependencies.database, context.event, part.index)) !== null) return;
  const downloaded = await downloadImage(context, part.imageUrl);
  if (downloaded.ok) await storeMessageAndPhoto(context, { ...part, imageUrl: part.imageUrl }, downloaded.image);
}
