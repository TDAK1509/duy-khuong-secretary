import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { countRecords } from '../../records/count-records.ts';
import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import { failTool, INVALID_DATE_ERROR } from './tool-result.ts';

const argumentsSchema = z.object({ added_from: z.string(), added_to: z.string() });

export async function runCountRecords(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (!isRealIsoDate(args.added_from) || !isRealIsoDate(args.added_to)) return failTool(INVALID_DATE_ERROR);
  const members = await countRecords(database, scope, { addedFrom: args.added_from, addedTo: args.added_to });
  return JSON.stringify({ members });
}
