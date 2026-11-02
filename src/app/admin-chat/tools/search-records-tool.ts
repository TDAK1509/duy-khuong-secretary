import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { searchRecords } from '../../records/search-records.ts';

const argumentsSchema = z.object({
  text: z.string().nullable(),
  category: z.string().nullable(),
  member: z.string().nullable(),
  plate: z.string().nullable(),
  added_from: z.string().nullable(),
  added_to: z.string().nullable(),
  cursor: z.string().nullable(),
});

export async function runSearchRecords(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  argumentsSchema.parse(parsedArguments);
  const page = await searchRecords(database, scope);
  return JSON.stringify({ items: page.items, next_cursor: page.nextCursor });
}
