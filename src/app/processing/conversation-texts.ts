import type { JoinResult } from '../workspaces/join-workspace.ts';
import { labelRole } from '../workspaces/role-label.ts';

export const WELCOME_TEXT =
  'Chào bạn. Đây là Trợ lý ghi chép công việc cho nhóm xe tải. Để bắt đầu, bạn nhắn mã mời mà quản lý nhóm đã gửi, ví dụ: MOI-7K4P9X.';

export const NO_LONGER_IN_A_WORKSPACE_TEXT =
  'Bạn không còn trong nhóm nào. Nếu cần tham gia lại, bạn xin quản lý một mã mời mới rồi nhắn mã đó vào đây.';

export const NO_PENDING_CHOICE_TEXT = 'Không có lựa chọn nào đang chờ. Bạn nhắn lại yêu cầu nhé.';

const JOINED_MEMBER_HINT = 'Từ giờ bạn gửi ảnh hóa đơn, phiếu giao nhận hoặc giấy tờ bảo dưỡng vào đây để lưu nhé. Trợ lý chỉ lưu dữ liệu, không trả lời câu hỏi. Câu hỏi khác, bạn hỏi quản lý nhé.';
const JOINED_ADMIN_HINT = 'Bạn có thể hỏi Trợ lý về dữ liệu của nhóm, mời hoặc xóa thành viên và đặt lịch tự động. Hỏi "Bạn làm được gì?" để xem đủ.';

export const DOCUMENT_SETUP_OFFER_TEXT =
  'Anh/chị có muốn khai báo các loại giấy tờ của công ty không? Trợ lý sẽ đề xuất mẫu từ các phiếu đã lưu, hoặc anh/chị gửi một ảnh mẫu, rồi chọn thông tin cần lưu. Nhờ vậy giấy tờ tài xế gửi được đọc đúng hơn. Trả lời "có" để bắt đầu.';

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

function formatJoinedText({ workspaceName, displayName, role, offersDocumentSetup }: JoinedPerson): string {
  const hint = role === 'admin' ? JOINED_ADMIN_HINT : JOINED_MEMBER_HINT;
  const offer = offersDocumentSetup ? [DOCUMENT_SETUP_OFFER_TEXT] : [];
  return [`Bạn đã vào nhóm "${workspaceName}" với tên ${displayName}, vai trò ${labelRole(role)}.`, hint, ...offer].join('\n');
}

export type JoinedPerson = Extract<JoinResult, { kind: 'joined' }>;

export function formatInviterNotice(joined: JoinedPerson, zaloName: string | null): string {
  const { displayName, workspaceName, role } = joined;
  return `${displayName} (tên Zalo: ${zaloName ?? 'không rõ'}) đã tham gia nhóm "${workspaceName}", vai trò ${labelRole(role)}.\nNếu không đúng người, bạn nhắn Trợ lý: "Xóa ${displayName} khỏi nhóm".`;
}
