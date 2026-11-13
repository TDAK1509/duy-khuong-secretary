import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { removePrivateFact } from '../../memory/private-memory.ts';
import { failTool, REFUSAL_ERROR } from './tool-result.ts';

const NOT_REMEMBERED_ERROR = 'Không tìm thấy điều này trong bản ghi nhớ.';

const argumentsSchema = z.strictObject({ fact: z.string() });

export async function runForget(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { fact } = argumentsSchema.parse(parsedArguments);
  const markdown = await removePrivateFact(database, scope, fact, NOT_REMEMBERED_ERROR);
  return markdown === null ? failTool(REFUSAL_ERROR) : JSON.stringify({ ok: true, markdown });
}
