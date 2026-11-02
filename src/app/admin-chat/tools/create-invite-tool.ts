import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { createInvite } from '../../workspaces/create-invite.ts';
import { hasLengthBetween, INVITE_VALID_FOR_MS, MAX_DISPLAY_NAME_LENGTH } from '../../workspaces/invite-rules.ts';
import { failInvalidArgument } from './tool-result.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({ display_name: z.string(), role: z.enum(['member', 'admin']) });

export async function runCreateInvite(
  { database, clock }: AdminToolDependencies,
  scope: AccessScope,
  parsedArguments: unknown,
): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const displayName = args.display_name.trim();
  if (!hasLengthBetween(displayName, MAX_DISPLAY_NAME_LENGTH)) return failInvalidArgument('display_name');
  const expiresAt = new Date(clock.now().getTime() + INVITE_VALID_FOR_MS);
  const code = await createInvite(database, {
    workspaceId: scope.workspaceId,
    createdBy: scope.userId,
    displayName,
    role: args.role,
    expiresAt,
  });
  return JSON.stringify({ ok: true, code });
}
