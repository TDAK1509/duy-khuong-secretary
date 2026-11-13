import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { addFact, isValidFact, listFacts } from '../../memory/memory-facts.ts';
import { updateMemberMemory, type MemberMemory } from '../../memory/member-memory.ts';
import { failTool, MEMBER_NOT_FOUND_ERROR, ToolRefusal } from './tool-result.ts';

const INVALID_FACT_ERROR = 'Thông tin cần lưu phải có từ 1 đến 200 ký tự và nằm trên một dòng.';
const MEMBER_FACTS_FULL_ERROR = 'Thông tin về người này đã đủ 2000 ký tự. Tôi chưa thêm thông tin mới và vẫn giữ mọi thông tin cũ.';

const uuidSchema = z.uuid();
const addArgumentsSchema = z.strictObject({ member_id: z.string(), fact: z.string() });

export async function runAddMemberFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id, fact: untrimmedFact } = addArgumentsSchema.parse(parsedArguments);
  if (!uuidSchema.safeParse(member_id).success) return failTool(MEMBER_NOT_FOUND_ERROR);
  const fact = untrimmedFact.trim();
  if (!isValidFact(fact)) throw new ToolRefusal(INVALID_FACT_ERROR);
  const memory = await updateMemberMemory(database, { workspaceId: scope.workspaceId, membershipId: member_id }, (current) => addFact(current, fact, MEMBER_FACTS_FULL_ERROR));
  return describeChange(memory);
}

function describeChange(memory: MemberMemory | null): string {
  if (memory === null) return failTool(MEMBER_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, member: memory.displayName, facts: listFacts(memory.markdown) });
}
