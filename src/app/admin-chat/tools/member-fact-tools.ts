import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { FACT_READERS } from '../../memory/fact-readers.ts';
import { addMemberFact, clearMemberFacts, readMemberFacts, removeMemberFact, type MemberFacts, type MemberRef, type SavedFact } from '../../memory/member-facts.ts';
import { isValidFact } from '../../memory/memory-facts.ts';
import { buildFactNote } from './member-fact-note.ts';
import { failTool, MEMBER_NOT_FOUND_ERROR, ToolRefusal } from './tool-result.ts';

const INVALID_FACT_ERROR = 'Thông tin cần lưu phải có từ 1 đến 200 ký tự và nằm trên một dòng.';
const MEMBER_FACTS_FULL_ERROR = 'Thông tin về người này đã đủ 2000 ký tự. Tôi chưa thêm thông tin mới và vẫn giữ mọi thông tin cũ.';
const FACT_NOT_FOUND_ERROR = 'Không tìm thấy thông tin này trong các thông tin đã lưu về người này.';

const uuidSchema = z.uuid();
const memberArgumentsSchema = z.strictObject({ member_id: z.string() });
const forgetArgumentsSchema = z.strictObject({ member_id: z.string(), fact: z.string() });
const addArgumentsSchema = z.strictObject({ member_id: z.string(), fact: z.string(), readers: z.enum(FACT_READERS) });

export async function runListMemberFacts(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id: memberId } = memberArgumentsSchema.parse(parsedArguments);
  const memory = await withMemberRef(scope, memberId, (ref) => readMemberFacts(database, ref));
  return memory === null ? failTool(MEMBER_NOT_FOUND_ERROR) : JSON.stringify({ member: memory.displayName, facts: describeFacts(memory) });
}

export async function runAddMemberFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id: memberId, fact: untrimmedFact, readers } = addArgumentsSchema.parse(parsedArguments);
  const fact = untrimmedFact.trim();
  if (!isValidFact(fact)) throw new ToolRefusal(INVALID_FACT_ERROR);
  const memory = await withMemberRef(scope, memberId, (ref) => addMemberFact(database, ref, scope, { fact, readers }, MEMBER_FACTS_FULL_ERROR));
  if (memory === null) return failTool(MEMBER_NOT_FOUND_ERROR);
  return JSON.stringify({ ok: true, member: memory.displayName, facts: describeFacts(memory), note: buildFactNote(memory.displayName, memory.saved) });
}

export async function runForgetMemberFact(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id: memberId, fact } = forgetArgumentsSchema.parse(parsedArguments);
  const memory = await withMemberRef(scope, memberId, (ref) => removeMemberFact(database, ref, fact, FACT_NOT_FOUND_ERROR));
  return reportChange(memory);
}

export async function runForgetAllMemberFacts(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const { member_id: memberId } = memberArgumentsSchema.parse(parsedArguments);
  const memory = await withMemberRef(scope, memberId, (ref) => clearMemberFacts(database, ref));
  return reportChange(memory);
}

async function withMemberRef<Result>(scope: AccessScope, memberId: string, work: (ref: MemberRef) => Promise<Result | null>): Promise<Result | null> {
  if (!uuidSchema.safeParse(memberId).success) return null;
  return work({ workspaceId: scope.workspaceId, membershipId: memberId });
}

function reportChange(memory: MemberFacts | null): string {
  return memory === null ? failTool(MEMBER_NOT_FOUND_ERROR) : JSON.stringify({ ok: true, member: memory.displayName, facts: describeFacts(memory) });
}

function describeFacts({ facts }: MemberFacts): { fact: string; readers: SavedFact['readers'] }[] {
  return facts.map(({ fact, readers }) => ({ fact, readers }));
}
