import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Photo } from '../../services/storage/photo-storage.ts';
import { runInTransaction } from '../db/transaction.ts';
import { listMemberFacts } from '../memory/list-member-facts.ts';
import { listWorkspaceLabels } from '../records/list-workspace-labels.ts';
import { listReaderCatalog } from '../documents/list-reader-catalog.ts';
import type { ReaderCatalog } from '../reading/document-rules.ts';
import { buildReaderPrompt } from '../reading/reader-prompt.ts';
import { READER_SCHEMA, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import { validateReading, type ReadAttempt } from '../reading/reading.ts';
import type { IntakeContext } from './intake-context.ts';
import { logReaderCall } from './log-reader-call.ts';

type MessageContent = { text: string | null; photo: Photo | null };

export async function readMessage(context: IntakeContext, message: MessageContent): Promise<ReadAttempt> {
  const { labels, catalog, facts } = await runInTransaction(context.dependencies.database, async (transaction) => ({
    labels: await listWorkspaceLabels(transaction, context.sender.workspaceId),
    catalog: await listReaderCatalog(transaction, context.sender.workspaceId),
    facts: await listMemberFacts(transaction, context.sender.workspaceId, context.sender),
  }));
  return readWithReader(context.reader, context.dependencies.clock.now(), message, labels, catalog, facts);
}

export async function readWithReader(
  reader: ReaderService,
  now: Date,
  message: MessageContent,
  labels: string[],
  catalog: ReaderCatalog,
  facts: string[],
): Promise<ReadAttempt> {
  const result = await reader.read({
    system: buildReaderPrompt(now, labels, catalog, facts),
    text: message.text,
    image: message.photo,
    schemaName: READER_SCHEMA_NAME,
    schema: READER_SCHEMA,
  });
  const attempt = result.ok ? validateReading(result.json) : result;
  logReaderCall(attempt.ok ? 'ok' : attempt.reason, result);
  return attempt;
}
