import { enqueueText } from '../delivery/enqueue-text.ts';
import type { Transaction } from '../db/transaction.ts';

export type ConnectionAnnouncement = { membershipId: string; maxTextLength: number; now: Date };

type AdminRow = { workspace_name: string; channel: string; account_id: string; external_user_id: string };

export async function announceConnection(transaction: Transaction, announcement: ConnectionAnnouncement): Promise<void> {
  const [admin] = await transaction.query<AdminRow>(
    `SELECT workspace.name AS workspace_name, identity.channel, identity.account_id, identity.external_user_id
     FROM memberships membership
     JOIN workspaces workspace ON workspace.id = membership.workspace_id
     JOIN channel_identities identity ON identity.user_id = membership.user_id
     WHERE membership.id = $1`,
    [announcement.membershipId],
  );
  if (!admin) return;
  await enqueueText(transaction, {
    to: { channel: admin.channel, accountId: admin.account_id, externalUserId: admin.external_user_id },
    text: formatConnectionNotice(admin.workspace_name),
    maxTextLength: announcement.maxTextLength,
    availableAt: announcement.now,
    adminMembershipId: announcement.membershipId,
  });
}

function formatConnectionNotice(workspaceName: string): string {
  return `ChatGPT vừa được kết nối với nhóm "${workspaceName}". Nếu không phải bạn, nhắn "ngắt ChatGPT" ngay.`;
}
