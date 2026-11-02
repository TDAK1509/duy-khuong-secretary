import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { removeMember } from '../../workspaces/remove-member.ts';
import { failTool, REFUSAL_ERROR } from './tool-result.ts';

const NOT_FOUND_ERROR = 'Không tìm thấy người này.';

const argumentsSchema = z.object({ member_id: z.string() });
const uuidSchema = z.uuid();

export async function runRemoveMember(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  if (!uuidSchema.safeParse(args.member_id).success) return failTool(NOT_FOUND_ERROR);
  const removal = await removeMember(database, { workspaceId: scope.workspaceId, callerUserId: scope.userId, membershipId: args.member_id });
  if (removal.kind === 'denied') return failTool(REFUSAL_ERROR);
  if (removal.kind === 'not_found') return failTool(NOT_FOUND_ERROR);
  if (removal.kind === 'is_caller') return failTool('Không thể tự xóa chính mình.');
  return JSON.stringify({ ok: true, removed: removal.displayName });
}
