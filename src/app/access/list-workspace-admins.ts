import type { ChannelRecipient } from '../../services/messaging/messaging-channel.ts';
import type { Transaction } from '../db/transaction.ts';

export type WorkspaceAdmin = { membershipId: string; recipient: ChannelRecipient };

type AdminRow = { membership_id: string; channel: string; account_id: string; external_user_id: string };

export async function listWorkspaceAdmins(transaction: Transaction, workspaceId: string): Promise<WorkspaceAdmin[]> {
  const rows = await transaction.query<AdminRow>(
    `SELECT memberships.id AS membership_id, identity.channel, identity.account_id, identity.external_user_id
     FROM memberships
     JOIN channel_identities identity ON identity.user_id = memberships.user_id
     WHERE memberships.workspace_id = $1 AND memberships.role = 'admin'
     ORDER BY memberships.created_at, memberships.id`,
    [workspaceId],
  );
  return rows.map((row) => ({
    membershipId: row.membership_id,
    recipient: { channel: row.channel, accountId: row.account_id, externalUserId: row.external_user_id },
  }));
}
