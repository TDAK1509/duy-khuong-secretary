import type { ReaderRequest, ReaderService } from '../../services/reading/reader-service.ts';
import { runInTransaction } from '../db/transaction.ts';
import { listMemberFacts } from '../memory/list-member-facts.ts';
import { listWorkspaceLabels } from '../records/list-workspace-labels.ts';
import { listReaderCatalog } from '../documents/list-reader-catalog.ts';
import { listReaderTemplates } from '../documents/list-reader-templates.ts';
import { createExampleLoader } from '../documents/templates/load-template-examples.ts';
import type { ReaderCatalog } from '../reading/document-rules.ts';
import { buildMessageParts, type MessageContent } from '../reading/message-parts.ts';
import { pickTemplate } from '../reading/pick-template.ts';
import { buildReaderDataParts, buildReaderPrompt } from '../reading/reader-prompt.ts';
import { applyPickedTemplate, type ListedTemplate, type ReaderTemplate } from '../reading/reader-template.ts';
import { buildReaderSchema, READER_SCHEMA_NAME } from '../reading/reader-schema.ts';
import { validateReading, type ReadAttempt } from '../reading/reading.ts';
import { buildExampleParts, type ExampleLoader, type TemplateExample } from '../reading/template-examples.ts';
import type { IntakeContext } from './intake-context.ts';
import { logReaderCall } from './log-reader-call.ts';

export async function readMessage(context: IntakeContext, message: MessageContent): Promise<ReadAttempt> {
  const { labels, catalog, facts, templates } = await runInTransaction(context.dependencies.database, async (transaction) => ({
    labels: await listWorkspaceLabels(transaction, context.sender.workspaceId),
    catalog: await listReaderCatalog(transaction, context.sender.workspaceId),
    facts: await listMemberFacts(transaction, context.sender.workspaceId, context.sender),
    templates: await listReaderTemplates(transaction, context.sender.workspaceId),
  }));
  const loadExamples = createExampleLoader(context.dependencies.database, context.sender.workspaceId, context.dependencies.photoStorage);
  return readWithReader(context.reader, context.dependencies.clock.now(), message, labels, catalog, facts, templates, loadExamples, context.sender.role === 'admin');
}

export async function readWithReader(
  reader: ReaderService,
  now: Date,
  message: MessageContent,
  labels: string[],
  catalog: ReaderCatalog,
  facts: string[],
  templates: ReaderTemplate[],
  loadExamples: ExampleLoader,
  fromAdmin = false,
): Promise<ReadAttempt> {
  const picked = await pickTemplate(reader, templates, message);
  const examples = await loadPickedExamples(loadExamples, picked);
  const result = await reader.read(buildReadRequest({ now, message, labels, catalog, facts, fromAdmin, picked, examples }));
  const attempt = result.ok ? validateReading(result.json) : result;
  logReaderCall(attempt.ok ? 'ok' : attempt.reason, result);
  return applyPickedTemplate(attempt, picked);
}

async function loadPickedExamples(loadExamples: ExampleLoader, picked: ListedTemplate | null): Promise<TemplateExample[]> {
  if (picked === null) return [];
  const examples = await loadExamples(picked.template.id);
  console.log(`[reader] template_examples=${examples.length}`);
  return examples;
}

const READ_REQUEST = 'Đọc tin nhắn và ảnh trong các thẻ dữ liệu ở trên theo các quy tắc, rồi trả về JSON.';

type ReadInputs = {
  now: Date;
  message: MessageContent;
  labels: string[];
  catalog: ReaderCatalog;
  facts: string[];
  fromAdmin: boolean;
  picked: ListedTemplate | null;
  examples: TemplateExample[];
};

function buildReadRequest({ now, message, labels, catalog, facts, fromAdmin, picked, examples }: ReadInputs): ReaderRequest {
  return {
    system: buildReaderPrompt(now, labels, catalog, facts, fromAdmin, picked),
    userParts: [
      ...buildReaderDataParts(labels, catalog, facts, picked),
      ...buildExampleParts(examples, picked?.shortId ?? ''),
      ...buildMessageParts(message),
      { kind: 'text', text: READ_REQUEST },
    ],
    schemaName: READER_SCHEMA_NAME,
    schema: buildReaderSchema(fromAdmin, picked !== null),
  };
}
