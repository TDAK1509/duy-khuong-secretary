import type { JoinResult } from '../workspaces/join-workspace.ts';

export const WELCOME_TEXT =
  'Chào bạn. Đây là Trợ lý ghi chép công việc cho nhóm xe tải. Để bắt đầu, bạn nhắn mã mời mà quản lý nhóm đã gửi, ví dụ: MOI-7K4P9X.';

export const NO_LONGER_IN_A_WORKSPACE_TEXT =
  'Bạn không còn trong nhóm nào. Nếu cần tham gia lại, bạn xin quản lý một mã mời mới rồi nhắn mã đó vào đây.';

const JOINED_MEMBER_HINT = 'Từ giờ bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng vào đây để lưu nhé.';
const JOINED_ADMIN_HINT = 'Bạn có thể hỏi Trợ lý về dữ liệu của nhóm, mời hoặc xóa thành viên và đặt lịch tự động.';

const INVALID_CODE_TEXT = 'Mã mời không đúng, đã dùng hoặc đã hết hạn. Bạn xin quản lý một mã mới nhé.';

export function formatJoinResult(result: JoinResult): string {
  switch (result.kind) {
    case 'invalid_code':
      return INVALID_CODE_TEXT;
    case 'already_member':
      return `Bạn đã ở trong nhóm "${result.workspaceName}".`;
    case 'joined':
      return formatJoinedText(result);
  }
}

function formatJoinedText({ workspaceName, displayName, role }: Extract<JoinResult, { kind: 'joined' }>): string {
  const roleLabel = role === 'admin' ? 'quản lý' : 'thành viên';
  const hint = role === 'admin' ? JOINED_ADMIN_HINT : JOINED_MEMBER_HINT;
  return `Bạn đã vào nhóm "${workspaceName}" với tên ${displayName}, vai trò ${roleLabel}.\n${hint}`;
}
