import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { failTool, INVALID_CURSOR_ERROR, INVALID_DATE_ERROR } from './tool-result.ts';
import { decodeSearchCursor, type SearchCursor } from '../../records/search-cursor.ts';
import { searchRecords, type SearchFilters } from '../../records/search-records.ts';

const argumentsSchema = z.object({
  text: z.string().nullable(),
  category: z.string().nullable(),
  member: z.string().nullable(),
  plate: z.string().nullable(),
  added_from: z.string().nullable(),
  added_to: z.string().nullable(),
  occurred_from: z.string().nullable().default(null),
  occurred_to: z.string().nullable().default(null),
  cursor: z.string().nullable(),
});

type SearchArguments = z.infer<typeof argumentsSchema>;

export async function runSearchRecords(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const decodedCursor = args.cursor === null ? null : decodeSearchCursor(args.cursor);
  if (args.cursor !== null && decodedCursor === null) return failTool(INVALID_CURSOR_ERROR);
  const page = await searchRecords(database, scope, toSearchFilters(args, decodedCursor));
  return JSON.stringify({ items: page.items, next_cursor: page.nextCursor });
}

function hasUnrealDate(args: SearchArguments): boolean {
  const dates = [args.added_from, args.added_to, args.occurred_from, args.occurred_to];
  return dates.some((date) => date !== null && !isRealIsoDate(date));
}

function toSearchFilters(args: SearchArguments, cursor: SearchCursor | null): SearchFilters {
  return {
    text: args.text,
    category: args.category,
    member: args.member,
    plate: args.plate,
    addedFrom: args.added_from,
    addedTo: args.added_to,
    occurredFrom: args.occurred_from,
    occurredTo: args.occurred_to,
    cursor,
  };
}
