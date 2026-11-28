import type { ReaderPart } from '../../services/reading/reader-service.ts';
import type { Photo, PhotoStorage } from '../../services/storage/photo-storage.ts';
import { wrapInlineRetrievedData } from './retrieved-data.ts';

export type StoredExample = { position: number; imageKey: string; expectedReading: Record<string, unknown> };

export type TemplateExample = { position: number; photo: Photo; expectedReading: Record<string, unknown> };

export type ExampleLoader = (templateId: string) => Promise<TemplateExample[]>;

export function buildExampleParts(examples: TemplateExample[], templateShortId: string): ReaderPart[] {
  return examples.flatMap(({ position, photo, expectedReading }) => [
    { kind: 'text' as const, text: `Ví dụ ${position} của mẫu đã chọn; ảnh ví dụ nằm ngay sau dòng này.` },
    { kind: 'image' as const, photo },
    { kind: 'text' as const, text: wrapInlineRetrievedData('template-example-reading', JSON.stringify({ ...expectedReading, template: templateShortId })) },
  ]);
}

export async function attachExamplePhotos(photoStorage: PhotoStorage, stored: StoredExample[]): Promise<TemplateExample[]> {
  const examples: TemplateExample[] = [];
  for (const { position, imageKey, expectedReading } of stored) {
    const photo = await findExamplePhoto(photoStorage, imageKey);
    if (photo !== null) examples.push({ position, photo, expectedReading });
  }
  return examples;
}

async function findExamplePhoto(photoStorage: PhotoStorage, imageKey: string): Promise<Photo | null> {
  try {
    const photo = await photoStorage.get(imageKey);
    if (photo === null) console.log(`[reader] template_example_skipped image_key=${imageKey} reason=missing`);
    return photo;
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    console.log(`[reader] template_example_skipped image_key=${imageKey} reason=${reason}`);
    return null;
  }
}
