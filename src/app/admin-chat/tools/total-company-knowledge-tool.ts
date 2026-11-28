import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { DOCUMENT_GROUPS } from '../../documents/document-groups.ts';
import { AMOUNT_OUTCOME_NAMES } from '../../facts/knowledge-outcomes.ts';
import { WEIGHT_MEANING } from '../../facts/knowledge-totals.ts';
import { summarizeKnowledgeValues } from '../../facts/summarize-knowledge-values.ts';
import { TOO_MANY_PAPERS_ERROR } from '../../trips/load-trip-papers.ts';
import { totalTripValues } from '../../trips/total-trip-values.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS, hasUnrealDate } from './document-filter-arguments.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';
import { failTool, INVALID_DATE_ERROR } from './tool-result.ts';

const argumentsSchema = z.object({
  value_name: z.enum(AMOUNT_OUTCOME_NAMES as [string, ...string[]]),
  ...DOCUMENT_FILTER_ARGUMENTS,
  group_by: z.enum(DOCUMENT_GROUPS),
});

export async function runTotalCompanyKnowledge({ database, dropOffReader }: AdminToolDependencies, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const totals = await totalTripValues(database, scope, { valueName: args.value_name, filters: buildDocumentFilters(args), groupBy: args.group_by }, dropOffReader ?? null);
  if (totals === null) return failTool(TOO_MANY_PAPERS_ERROR);
  return JSON.stringify({
    ok: true,
    value_name: args.value_name,
    ...summarizeKnowledgeValues(totals.documents),
    weight_meaning: WEIGHT_MEANING,
    review_documents: totals.reviewDocuments,
    not_reread_messages: totals.notRereadMessages,
  });
}
