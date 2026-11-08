import { z } from 'zod';
import type { Database } from '../../db/transaction.ts';
import { listDocumentNumbers } from '../../documents/list-document-numbers.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS } from './document-filter-arguments.ts';

const argumentsSchema = z.object(DOCUMENT_FILTER_ARGUMENTS);

export async function runListDocumentNumbers(database: Database, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const numbers = await listDocumentNumbers(database, buildDocumentFilters(args));
  return JSON.stringify({ ok: true, numbers });
}
