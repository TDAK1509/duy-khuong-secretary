import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { linkIdentityToNewUser } from '../identities/link-identity-to-new-user.ts';
import type { Transaction } from '../db/transaction.ts';
import { hashInviteCode } from './invite-code.ts';

type InviteRow = { workspace_id: string; display_name: string; role: 'admin' | 'member' };

export async function joinWithInviteCode(
  transaction: Transaction,
  identity: ChannelIdentity,
  code: string,
): Promise<void> {
  const [invite] = await transaction.query<InviteRow>(
    'SELECT workspace_id, display_name, role FROM workspace_invites WHERE code_hash = $1',
    [hashInviteCode(code)],
  );
  if (!invite) return;
  const userId = await linkIdentityToNewUser(transaction, identity);
  await transaction.query(
    'INSERT INTO memberships (workspace_id, user_id, role, display_name) VALUES ($1, $2, $3, $4)',
    [invite.workspace_id, userId, invite.role, invite.display_name],
  );
}
