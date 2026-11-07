import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listNumberLabels } from '../../records/list-number-labels.ts';
import { FILTER_ARGUMENTS, hasUnrealDate, buildRecordFilters } from './filter-arguments.ts';
import { failTool, INVALID_DATE_ERROR } from './tool-result.ts';

const argumentsSchema = z.object(FILTER_ARGUMENTS);

export async function runListNumberLabels(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (hasUnrealDate(args)) return failTool(INVALID_DATE_ERROR);
  const labels = await listNumberLabels(database, scope, buildRecordFilters(args));
  return JSON.stringify({ ok: true, labels });
}
