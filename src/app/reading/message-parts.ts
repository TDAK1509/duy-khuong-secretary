import type { ReaderPart } from '../../services/reading/reader-service.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';
import { buildPhotoParts, wrapRetrievedData } from './retrieved-data.ts';

export type MessageContent = { text: string | null; photo: Photo | null };

export function buildMessageParts(message: MessageContent): ReaderPart[] {
  return [
    ...(message.text === null ? [] : [{ kind: 'text' as const, text: wrapRetrievedData('message', message.text) }]),
    ...(message.photo === null ? [] : buildPhotoParts(message.photo)),
  ];
}
