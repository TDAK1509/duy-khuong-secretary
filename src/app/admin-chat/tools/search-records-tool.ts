import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { failTool, INVALID_CURSOR_ERROR, INVALID_DATE_ERROR } from './tool-result.ts';
import { decodeSearchCursor } from '../../records/search-cursor.ts';
import { searchRecords } from '../../records/search-records.ts';

const argumentsSchema = z.object({
  text: z.string().nullable(),
  category: z.enum(['fuel', 'toll', 'delivery_pickup', 'delivery_dropoff', 'maintenance', 'certificate', 'other']).nullable(),
  member: z.string().nullable(),
  plate: z.string().nullable(),
  added_from: z.string().nullable(),
  added_to: z.string().nullable(),
  cursor: z.string().nullable(),
});

export async function runSearchRecords(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if ([args.added_from, args.added_to].some((date) => date !== null && !isRealIsoDate(date))) {
    return failTool(INVALID_DATE_ERROR);
  }
  const decodedCursor = args.cursor === null ? null : decodeSearchCursor(args.cursor);
  if (args.cursor !== null && decodedCursor === null) return failTool(INVALID_CURSOR_ERROR);
  const page = await searchRecords(database, scope, {
    text: args.text,
    category: args.category,
    member: args.member,
    plate: args.plate,
    addedFrom: args.added_from,
    addedTo: args.added_to,
    cursor: decodedCursor,
  });
  return JSON.stringify({ items: page.items, next_cursor: page.nextCursor });
}
