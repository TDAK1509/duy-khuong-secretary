import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import type { ChannelIdentity } from '../identities/channel-identity.ts';
import { clearPendingChoice } from '../identities/clear-pending-choice.ts';
import type { PendingChoice } from '../identities/pending-choice.ts';
import { setCurrentWorkspace } from '../identities/set-current-workspace.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';

const NUMBER_NOT_IN_LIST_TEXT = 'Số không hợp lệ. Bạn nhắn "đổi nhóm" để xem lại danh sách.';

type WorkspaceChoice = { id: string; name: string };

export function isSwitchCommand(text: string): boolean {
  return toAccentFreeForm(text) === 'doi nhom';
}

export async function answerSwitchCommand(
  transaction: Transaction,
  userId: string,
  currentWorkspaceId: string,
): Promise<Reply> {
  const workspaces = await findWorkspacesOfUser(transaction, userId);
  const currentName = workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.name ?? '';
  if (workspaces.length === 1) return { text: `Bạn chỉ ở một nhóm: "${currentName}".` };
  const lines = workspaces.map((workspace, index) => `${index + 1}. ${workspace.name}`);
  return {
    text: [`Bạn đang ở nhóm "${currentName}". Chọn nhóm bằng cách trả lời số:`, ...lines].join('\n'),
    offeredChoice: { kind: 'workspace_pick', workspaceIds: workspaces.map((workspace) => workspace.id) },
  };
}

export type Chooser = { identity: ChannelIdentity; userId: string };

export async function pickWorkspace(
  transaction: Transaction,
  chooser: Chooser,
  choice: Extract<PendingChoice, { kind: 'workspace_pick' }>,
  number: number,
): Promise<Reply> {
  await clearPendingChoice(transaction, chooser.identity);
  const offeredId = choice.workspaceIds[number - 1];
  const workspace = offeredId === undefined ? null : await findWorkspaceOfUser(transaction, chooser.userId, offeredId);
  if (workspace === null) return { text: NUMBER_NOT_IN_LIST_TEXT };
  await setCurrentWorkspace(transaction, chooser.identity, workspace.id);
  return { text: `Đã chuyển sang nhóm "${workspace.name}". Tin nhắn tiếp theo sẽ lưu vào nhóm này.` };
}

async function findWorkspaceOfUser(transaction: Transaction, userId: string, workspaceId: string): Promise<WorkspaceChoice | null> {
  const workspaces = await findWorkspacesOfUser(transaction, userId);
  return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
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
