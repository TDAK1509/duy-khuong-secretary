import type { Photo } from '../../services/storage/photo-storage.ts';
import { decideReading } from '../reading/decide-reading.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import type { IntakeContext } from './intake-context.ts';
import type { IntakeOutcome } from './intake-outcome.ts';
import { planReply } from './plan-reply.ts';
import { runReplyStage } from './run-reply-stage.ts';

export type MessageToRead = { id: string; text: string | null; photo: Photo | null };

export async function replyToMessage(context: IntakeContext, message: MessageToRead): Promise<IntakeOutcome> {
  const decision = await decideReading(context.readers, {
    system: buildReaderPrompt(context.dependencies.clock.now()),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
  await runReplyStage(context, message.id, planReply(decision));
  return { kind: 'replied' };
}
