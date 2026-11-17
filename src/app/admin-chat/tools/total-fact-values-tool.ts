import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { DOCUMENT_GROUPS } from '../../documents/document-groups.ts';
import { summarizeFactValues } from '../../facts/summarize-fact-values.ts';
import { totalFactValues, WEIGHT_MEANING } from '../../facts/total-fact-values.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS, hasUnrealDate } from './document-filter-arguments.ts';
import { failTool, INVALID_DATE_ERROR } from './tool-result.ts';

const argumentsSchema = z.object({
  value_name: z.string(),
  ...DOCUMENT_FILTER_ARGUMENTS,
  group_by: z.enum(DOCUMENT_GROUPS),
});

export async function runTotalFactValues(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const totals = await totalFactValues(database, scope, { valueName: args.value_name, filters: buildDocumentFilters(args), groupBy: args.group_by });
  return JSON.stringify({
    ok: true,
    value_name: args.value_name,
    ...summarizeFactValues(totals.documents),
    weight_meaning: WEIGHT_MEANING,
    review_documents: totals.reviewDocuments,
    not_reread_messages: totals.notRereadMessages,
  });
}
