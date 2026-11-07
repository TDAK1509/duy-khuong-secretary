import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { FILTER_ARGUMENTS, hasUnrealDate, buildRecordFilters } from './filter-arguments.ts';
import { failTool, INVALID_CURSOR_ERROR, INVALID_DATE_ERROR } from './tool-result.ts';
import { decodeSearchCursor } from '../../records/search-cursor.ts';
import { searchRecords } from '../../records/search-records.ts';

const argumentsSchema = z.object({ ...FILTER_ARGUMENTS, cursor: z.string().nullable() });

export async function runSearchRecords(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const decodedCursor = args.cursor === null ? null : decodeSearchCursor(args.cursor);
  if (args.cursor !== null && decodedCursor === null) return failTool(INVALID_CURSOR_ERROR);
  const page = await searchRecords(database, scope, { ...buildRecordFilters(args), cursor: decodedCursor });
  return JSON.stringify({ items: page.items, next_cursor: page.nextCursor });
}
