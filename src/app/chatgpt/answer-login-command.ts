import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import { generateLoginCode, hashLoginCode } from './login-code.ts';
import { SIGN_IN_VALID_FOR_MS } from './sign-in-limits.ts';

export type LoginCommand = { userId: string; workspaceId: string; now: Date };

type MembershipRow = { membership_id: string; role: 'admin' | 'member'; workspace_name: string };

export async function answerLoginCommand(transaction: Transaction, command: LoginCommand): Promise<Reply> {
  const membership = await findMembership(transaction, command);
  if (membership.role === 'member') return { text: formatMemberRefusal(membership.workspace_name) };
  const code = generateLoginCode();
  await storeLoginCode(transaction, { ...command, membershipId: membership.membership_id, code });
  return { text: formatCodeExplanation(membership.workspace_name), followUpText: code, adminMembershipId: membership.membership_id };
}

async function findMembership(transaction: Transaction, { userId, workspaceId }: LoginCommand): Promise<MembershipRow> {
  const [membership] = await transaction.query<MembershipRow>(
    `SELECT membership.id AS membership_id, membership.role, workspace.name AS workspace_name
     FROM memberships membership
     JOIN workspaces workspace ON workspace.id = membership.workspace_id
     WHERE membership.user_id = $1 AND membership.workspace_id = $2`,
    [userId, workspaceId],
  );
  if (!membership) throw new Error('the sender has no membership in the workspace');
  return membership;
}

type NewLoginCode = LoginCommand & { membershipId: string; code: string };

async function storeLoginCode(transaction: Transaction, { userId, membershipId, code, now }: NewLoginCode): Promise<void> {
  await transaction.query(
    `INSERT INTO chatgpt_login_codes (user_id, membership_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
     SET membership_id = EXCLUDED.membership_id, code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, created_at = now()`,
    [userId, membershipId, hashLoginCode(code), new Date(now.getTime() + SIGN_IN_VALID_FOR_MS)],
  );
}

function formatMemberRefusal(workspaceName: string): string {
  return `Chỉ quản lý nhóm mới kết nối được ChatGPT. Ở nhóm "${workspaceName}", bạn là thành viên.`;
}

function formatCodeExplanation(workspaceName: string): string {
  return [
    'Mã kết nối ChatGPT của bạn ở tin nhắn tiếp theo. Nhấn giữ tin nhắn đó để sao chép, rồi dán vào trang kết nối ChatGPT của chính bạn.',
    `Mã cho ChatGPT đọc và thay đổi dữ liệu nhóm "${workspaceName}". Mã hết hạn sau 10 phút. Không đưa mã này cho ai, kể cả người nói là của Trợ lý.`,
  ].join('\n');
}
