import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { totalDocumentNumbers } from '../../documents/total-document-numbers.ts';

const argumentsSchema = z.object({
  meaning: z.string(),
  lines: z.enum(['document', 'item']),
  organization: z.string(),
});

export async function runTotalDocumentNumbers(database: Database, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const totals = await totalDocumentNumbers(database, { meaning: args.meaning, organization: args.organization });
  return JSON.stringify({ ok: true, meaning: args.meaning, groups: totals.groups });
}
