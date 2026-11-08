import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { DOCUMENT_GROUPS } from '../../documents/document-groups.ts';
import { totalDocumentNumbers } from '../../documents/total-document-numbers.ts';

const argumentsSchema = z.object({
  meaning: z.string(),
  lines: z.enum(['document', 'item']),
  organization: z.string().nullable(),
  stage: z.enum(['dispatch', 'receipt']).nullable(),
  date_meaning: z.string().nullable(),
  group_by: z.enum(DOCUMENT_GROUPS),
});

export async function runTotalDocumentNumbers(database: Database, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const filters = { organization: args.organization, stage: args.stage, dateMeaning: args.date_meaning };
  const totals = await totalDocumentNumbers(database, { meaning: args.meaning, lines: args.lines, filters, groupBy: args.group_by });
  return JSON.stringify({
    ok: true,
    meaning: args.meaning,
    groups: totals.groups,
    pending_name_documents: totals.pendingNameDocuments,
    review_documents: totals.reviewDocuments,
    without_number: totals.withoutNumber,
  });
}
