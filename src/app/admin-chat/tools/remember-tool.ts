import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listFacts, writeFacts } from '../../memory/memory-facts.ts';
import { updateUserMemory } from '../../memory/user-memory.ts';
import { failTool, REFUSAL_ERROR, ToolRefusal } from './tool-result.ts';

const MAX_FACT_LENGTH = 200;
const MAX_MEMORY_LENGTH = 2000;
const MEMORY_FULL_ERROR = 'Bản ghi nhớ đã đủ 2000 ký tự. Tôi chưa thêm điều mới và vẫn giữ mọi điều cũ.';
const LINE_BREAK_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const INVALID_FACT_ERROR = 'Điều cần nhớ phải có từ 1 đến 200 ký tự và nằm trên một dòng.';

const argumentsSchema = z.strictObject({ fact: z.string() });

export async function runRemember(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const fact = argumentsSchema.parse(parsedArguments).fact.trim();
  if (!isValidFact(fact)) throw new ToolRefusal(INVALID_FACT_ERROR);
  const markdown = await updateUserMemory(database, scope, (current) => addFact(current, fact));
  return markdown === null ? failTool(REFUSAL_ERROR) : JSON.stringify({ ok: true, markdown });
}

function addFact(markdown: string, fact: string): string {
  const facts = listFacts(markdown);
  if (facts.includes(fact)) return markdown;
  const extended = writeFacts([...facts, fact]);
  if ([...extended].length > MAX_MEMORY_LENGTH) throw new ToolRefusal(MEMORY_FULL_ERROR);
  return extended;
}

function isValidFact(fact: string): boolean {
  const length = [...fact].length;
  return length >= 1 && length <= MAX_FACT_LENGTH && !LINE_BREAK_OR_CONTROL.test(fact);
}
