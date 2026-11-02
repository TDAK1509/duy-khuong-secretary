import { z } from 'zod';
import type { AccessScope } from '../../access/access-scope.ts';
import { findConnectedAccountId } from '../../channel-auth/find-connected-account.ts';
import { createInvite } from '../../workspaces/create-invite.ts';
import { formatVietnamDateTime } from '../../workspaces/format-expiry.ts';
import { hasLengthBetween, INVITE_VALID_FOR_MS, MAX_DISPLAY_NAME_LENGTH } from '../../workspaces/invite-rules.ts';
import { labelRole } from '../../workspaces/role-label.ts';
import { failInvalidArgument } from './tool-result.ts';
import type { AdminToolDependencies } from './tool-dependencies.ts';

const argumentsSchema = z.object({ display_name: z.string(), role: z.enum(['member', 'admin']) });

export async function runCreateInvite(
  dependencies: AdminToolDependencies,
  scope: AccessScope,
  parsedArguments: unknown,
): Promise<string> {
  const args = argumentsSchema.parse(parsedArguments);
  const displayName = args.display_name.trim();
  if (!hasLengthBetween(displayName, MAX_DISPLAY_NAME_LENGTH)) return failInvalidArgument('display_name');
  return storeInvite(dependencies, scope, { displayName, role: args.role });
}

type InviteRequest = { displayName: string; role: 'admin' | 'member' };

async function storeInvite(
  { database, clock }: AdminToolDependencies,
  scope: AccessScope,
  { displayName, role }: InviteRequest,
): Promise<string> {
  const expiresAt = new Date(clock.now().getTime() + INVITE_VALID_FOR_MS);
  const code = await createInvite(database, { workspaceId: scope.workspaceId, createdBy: scope.userId, displayName, role, expiresAt });
  return JSON.stringify({
    ok: true,
    code,
    display_name: displayName,
    role: labelRole(role),
    expires: formatVietnamDateTime(expiresAt),
    oa_link: `https://zalo.me/${await findConnectedAccountId(database, 'zalo-oa')}`,
  });
}
