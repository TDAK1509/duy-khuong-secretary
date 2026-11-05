import type { Photo } from '../../services/storage/photo-storage.ts';
import { decideReading, type ReadingDecision } from '../reading/decide-reading.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import type { IntakeContext } from './intake-context.ts';

export function readMessage(context: IntakeContext, message: { text: string | null; photo: Photo | null }): Promise<ReadingDecision> {
  return decideReading(context.readers, {
    system: buildReaderPrompt(context.dependencies.clock.now()),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
}
