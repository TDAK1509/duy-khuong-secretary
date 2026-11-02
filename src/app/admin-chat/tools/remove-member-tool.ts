import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { removeMember } from '../../workspaces/remove-member.ts';
import { failTool } from './tool-result.ts';

const argumentsSchema = z.object({ member_id: z.string() });

export async function runRemoveMember(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const removal = await removeMember(database, { workspaceId: scope.workspaceId, callerUserId: scope.userId, membershipId: args.member_id });
  if (removal.kind === 'is_caller') return failTool('Không thể tự xóa chính mình.');
  return JSON.stringify({ ok: true, removed: removal.displayName });
}
