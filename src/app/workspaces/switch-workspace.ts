import type { Transaction } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';

type WorkspaceChoice = { id: string; name: string };

export function isSwitchCommand(text: string): boolean {
  return toAccentFreeForm(text) === 'doi nhom';
}

export async function listWorkspaces(transaction: Transaction, userId: string, currentWorkspaceId: string): Promise<string> {
  const workspaces = await findWorkspacesOfUser(transaction, userId);
  const currentName = workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.name ?? '';
  const lines = workspaces.map((workspace, index) => `${index + 1}. ${workspace.name}`);
  return [`Bạn đang ở nhóm "${currentName}". Chọn nhóm bằng cách trả lời số:`, ...lines].join('\n');
}

function findWorkspacesOfUser(transaction: Transaction, userId: string): Promise<WorkspaceChoice[]> {
  return transaction.query<WorkspaceChoice>(
    `SELECT workspace.id, workspace.name
     FROM memberships membership
     JOIN workspaces workspace ON workspace.id = membership.workspace_id
     WHERE membership.user_id = $1
     ORDER BY workspace.name, workspace.id`,
    [userId],
  );
}
