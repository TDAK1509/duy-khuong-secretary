import type { Reply } from '../delivery/reply.ts';
import type { Transaction } from '../db/transaction.ts';
import { generateLoginCode } from './login-code.ts';

export async function answerLoginCommand(transaction: Transaction, workspaceId: string): Promise<Reply> {
  const [workspace] = await transaction.query<{ name: string }>('SELECT name FROM workspaces WHERE id = $1', [workspaceId]);
  return { text: formatCodeExplanation(workspace?.name ?? ''), followUpText: generateLoginCode() };
}

function formatCodeExplanation(workspaceName: string): string {
  return [
    'Mã kết nối ChatGPT của bạn ở tin nhắn tiếp theo. Nhấn giữ tin nhắn đó để sao chép, rồi dán vào trang kết nối ChatGPT của chính bạn.',
    `Mã cho ChatGPT đọc và thay đổi dữ liệu nhóm "${workspaceName}". Mã hết hạn sau 10 phút. Không đưa mã này cho ai, kể cả người nói là của Trợ lý.`,
  ].join('\n');
}
