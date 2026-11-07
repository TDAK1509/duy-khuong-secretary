import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import { validateReading, type ReadAttempt } from '../reading/reading.ts';
import type { IntakeContext } from './intake-context.ts';

type MessageContent = { text: string | null; photo: Photo | null };

export function readMessage(context: IntakeContext, message: MessageContent): Promise<ReadAttempt> {
  return readWithReader(context.reader, context.dependencies.clock.now(), message, []);
}

export async function readWithReader(reader: ReaderService, now: Date, message: MessageContent, labels: string[]): Promise<ReadAttempt> {
  const result = await reader.read({
    system: buildReaderPrompt(now, labels),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
  return result.ok ? validateReading(result.json) : result;
}
