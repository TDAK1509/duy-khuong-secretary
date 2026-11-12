import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { listFacts, writeFacts } from '../../memory/memory-facts.ts';
import { updateUserMemory } from '../../memory/user-memory.ts';
import { failTool, REFUSAL_ERROR } from './tool-result.ts';

const argumentsSchema = z.strictObject({ fact: z.string() });

export async function runForget(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { fact } = argumentsSchema.parse(parsedArguments);
  const markdown = await updateUserMemory(database, scope, (current) => removeFact(current, fact));
  return markdown === null ? failTool(REFUSAL_ERROR) : JSON.stringify({ ok: true, markdown });
}

function removeFact(markdown: string, fact: string): string {
  return writeFacts(listFacts(markdown).filter((remembered) => remembered !== fact));
}
