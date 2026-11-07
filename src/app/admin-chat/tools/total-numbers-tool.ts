import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { NUMBER_GROUPS, totalNumbers } from '../../records/total-numbers.ts';
import { FILTER_ARGUMENTS, toRecordFilters } from './filter-arguments.ts';

const argumentsSchema = z.object({ label: z.string(), ...FILTER_ARGUMENTS, group_by: z.enum(NUMBER_GROUPS) });

export async function runTotalNumbers(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const totals = await totalNumbers(database, scope, { label: args.label, filters: toRecordFilters(args), groupBy: args.group_by });
  return JSON.stringify({ ok: true, label: args.label, groups: totals.groups, without_number: totals.withoutNumber });
}
