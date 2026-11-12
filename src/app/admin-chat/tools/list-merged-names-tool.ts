import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listMergedNames } from '../../documents/list-merged-names.ts';

const argumentsSchema = z.object({ text: z.string().nullable() });

export async function runListMergedNames(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  return JSON.stringify({ ok: true, ...(await listMergedNames(database, scope, args.text)) });
}
