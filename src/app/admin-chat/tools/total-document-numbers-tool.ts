import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { DOCUMENT_GROUPS } from '../../documents/document-groups.ts';
import { totalDocumentNumbers } from '../../documents/total-document-numbers.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS, hasUnrealDate } from './document-filter-arguments.ts';
import { failTool, INVALID_DATE_ERROR } from './tool-result.ts';

const argumentsSchema = z.object({
  meaning: z.string(),
  lines: z.enum(['document', 'item']),
  ...DOCUMENT_FILTER_ARGUMENTS,
  group_by: z.enum(DOCUMENT_GROUPS),
});

export async function runTotalDocumentNumbers(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const request = { meaning: args.meaning, lines: args.lines, filters: buildDocumentFilters(args), groupBy: args.group_by };
  const totals = await totalDocumentNumbers(database, scope, request);
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
