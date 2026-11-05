import { z } from 'zod';
import type { ClaimedEvent } from '../processing/claimed-event.ts';

export type IntakePart = { index: number; text: string | null; imageUrl: string | null };

const textPayloadSchema = z.object({ text: z.string() });
const imagesPayloadSchema = z.object({ image_urls: z.array(z.string()), caption: z.string().nullable() });

export function readIntakeParts(event: ClaimedEvent): IntakePart[] {
  if (event.kind === 'text') return [{ index: 0, text: textPayloadSchema.parse(event.payload).text, imageUrl: null }];
  const { image_urls: imageUrls, caption } = imagesPayloadSchema.parse(event.payload);
  return imageUrls.map((imageUrl, index) => ({ index, text: caption, imageUrl }));
}

export function hasSeveralPhotos(event: ClaimedEvent): boolean {
  return event.kind === 'images' && readIntakeParts(event).length > 1;
}
