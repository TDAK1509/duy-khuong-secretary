import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { isValidFact } from '../../memory/memory-facts.ts';
import { addPrivateFact } from '../../memory/private-memory.ts';
import { failTool, REFUSAL_ERROR, ToolRefusal } from './tool-result.ts';

const MEMORY_FULL_ERROR = 'Bản ghi nhớ đã đủ 2000 ký tự. Tôi chưa thêm điều mới và vẫn giữ mọi điều cũ.';
const INVALID_FACT_ERROR = 'Điều cần nhớ phải có từ 1 đến 200 ký tự và nằm trên một dòng.';

const argumentsSchema = z.strictObject({ fact: z.string() });

export async function runRemember(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const fact = argumentsSchema.parse(parsedArguments).fact.trim();
  if (!isValidFact(fact)) throw new ToolRefusal(INVALID_FACT_ERROR);
  const markdown = await addPrivateFact(database, scope, fact, MEMORY_FULL_ERROR);
  return markdown === null ? failTool(REFUSAL_ERROR) : JSON.stringify({ ok: true, markdown });
}
