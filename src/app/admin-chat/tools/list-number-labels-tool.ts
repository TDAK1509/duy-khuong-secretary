import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listNumberLabels } from '../../records/list-number-labels.ts';
import { FILTER_ARGUMENTS, toRecordFilters } from './filter-arguments.ts';

const argumentsSchema = z.object(FILTER_ARGUMENTS);

export async function runListNumberLabels(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const labels = await listNumberLabels(database, scope, toRecordFilters(args));
  return JSON.stringify({ ok: true, labels });
}
