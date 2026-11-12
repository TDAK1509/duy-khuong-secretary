import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listDocuments } from '../../documents/list-documents.ts';
import { decodeSearchCursor } from '../../records/search-cursor.ts';
import { buildDocumentFilters, DOCUMENT_FILTER_ARGUMENTS, hasUnrealDate } from './document-filter-arguments.ts';
import { failTool, INVALID_CURSOR_ERROR, INVALID_DATE_ERROR, REFUSAL_ERROR } from './tool-result.ts';

const argumentsSchema = z.object({
  meaning: z.string(),
  lines: z.enum(['document', 'item']),
  ...DOCUMENT_FILTER_ARGUMENTS,
  cursor: z.string().nullable(),
});

export async function runListDocuments(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  if (scope.role !== 'admin') return failTool(REFUSAL_ERROR);
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const decodedCursor = args.cursor === null ? null : decodeSearchCursor(args.cursor);
  if (args.cursor !== null && decodedCursor === null) return failTool(INVALID_CURSOR_ERROR);
  const request = { meaning: args.meaning, lines: args.lines, filters: buildDocumentFilters(args) };
  const page = await listDocuments(database, scope, request, decodedCursor);
  return JSON.stringify({ ok: true, documents: page.documents, next_cursor: page.nextCursor });
}
