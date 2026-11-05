import type { Photo } from '../../services/storage/photo-storage.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import { validateReading, type ReadAttempt } from '../reading/reading.ts';
import type { IntakeContext } from './intake-context.ts';

export async function readMessage(context: IntakeContext, message: { text: string | null; photo: Photo | null }): Promise<ReadAttempt> {
  const result = await context.reader.read({
    system: buildReaderPrompt(context.dependencies.clock.now()),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
  return result.ok ? validateReading(result.json) : result;
}
