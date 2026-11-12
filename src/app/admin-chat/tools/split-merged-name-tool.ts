import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { splitMergedName } from '../../documents/split-merged-name.ts';
import { failTool } from './tool-result.ts';

const NOT_FOUND_ERROR = 'Không tìm thấy tên đã gộp này.';

const argumentsSchema = z.object({ printed_name: z.string() });

export async function runSplitMergedName(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const split = await splitMergedName(database, scope.workspaceId, args.printed_name);
  if (!split) return failTool(NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, documents: split.documents });
}
