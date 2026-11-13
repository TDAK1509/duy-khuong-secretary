import { listWorkspaceAdmins } from '../access/list-workspace-admins.ts';
import type { Transaction } from '../db/transaction.ts';
import { enqueueText } from '../delivery/enqueue-text.ts';
import type { ChargeSetting } from './charge-setting.ts';
import { formatNoCreditsNotice } from './no-credits-notice.ts';

export async function notifyAdminsOfNoCredits(transaction: Transaction, workspaceId: string, { clock, maxTextLength }: ChargeSetting): Promise<void> {
  const text = formatNoCreditsNotice(await findWorkspaceName(transaction, workspaceId));
  for (const admin of await listWorkspaceAdmins(transaction, workspaceId)) {
    await enqueueText(transaction, {
      to: admin.recipient,
      adminMembershipId: admin.membershipId,
      requiresOpenWindow: true,
      text,
      maxTextLength,
      availableAt: clock.now(),
    });
  }
}

async function findWorkspaceName(transaction: Transaction, workspaceId: string): Promise<string> {
  const [workspace] = await transaction.query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId]);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);
  return workspace.name;
}
