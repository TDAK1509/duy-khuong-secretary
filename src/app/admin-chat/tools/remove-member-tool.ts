import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import { removeMember } from '../../workspaces/remove-member.ts';

const argumentsSchema = z.object({ member_id: z.string() });

export async function runRemoveMember(database: Database, scope: AccessScope, parsedArguments: unknown): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const removed = await removeMember(database, scope.workspaceId, args.member_id);
  return JSON.stringify({ ok: true, removed: removed.displayName });
}
