import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { DOCUMENT_GROUPS } from '../../documents/document-groups.ts';
import { totalDocumentNumbers } from '../../documents/total-document-numbers.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS } from './document-filter-arguments.ts';

const argumentsSchema = z.object({
  meaning: z.string(),
  lines: z.enum(['document', 'item']),
  ...DOCUMENT_FILTER_ARGUMENTS,
  group_by: z.enum(DOCUMENT_GROUPS),
});

export async function runTotalDocumentNumbers(database: Database, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const request = { meaning: args.meaning, lines: args.lines, filters: buildDocumentFilters(args), groupBy: args.group_by };
  const totals = await totalDocumentNumbers(database, request);
  return JSON.stringify({
    ok: true,
    meaning: args.meaning,
    groups: totals.groups,
    pending_name_documents: totals.pendingNameDocuments,
    review_documents: totals.reviewDocuments,
    without_number: totals.withoutNumber,
    not_reread_messages: totals.notRereadMessages,
  });
}
