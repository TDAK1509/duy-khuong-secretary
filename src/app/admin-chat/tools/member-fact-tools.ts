import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { addFact, listFacts } from '../../memory/memory-facts.ts';
import { updateMemberMemory, type MemberMemory } from '../../memory/member-memory.ts';
import { failTool, MEMBER_NOT_FOUND_ERROR } from './tool-result.ts';

const MEMBER_FACTS_FULL_ERROR = 'Thông tin về người này đã đủ 2000 ký tự. Tôi chưa thêm thông tin mới và vẫn giữ mọi thông tin cũ.';

const addArgumentsSchema = z.strictObject({ member_id: z.string(), fact: z.string() });

export async function runAddMemberFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id, fact: untrimmedFact } = addArgumentsSchema.parse(parsedArguments);
  const fact = untrimmedFact.trim();
  const memory = await updateMemberMemory(database, { workspaceId: scope.workspaceId, membershipId: member_id }, (current) => addFact(current, fact, MEMBER_FACTS_FULL_ERROR));
  return describeChange(memory);
}

function describeChange(memory: MemberMemory | null): string {
  if (memory === null) return failTool(MEMBER_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, member: memory.displayName, facts: listFacts(memory.markdown) });
}
