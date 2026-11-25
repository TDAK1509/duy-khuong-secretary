import type { GuardedTool } from './admin-text-guard.ts';

export const REFUSAL_ERROR = 'Không có quyền.';
export const MEMBER_NOT_FOUND_ERROR = 'Không tìm thấy người này.';
export const INVALID_CURSOR_ERROR = 'Con trỏ không hợp lệ.';
export const INVALID_DATE_ERROR = 'Ngày không hợp lệ.';

export function failTool(error: string): string {
  return JSON.stringify({ ok: false, error });
}

export function failInvalidArgument(field: string): string {
  return failTool(`Dữ liệu không hợp lệ: ${field}`);
}

export class ToolRefusal extends Error {}

export function refuseInvalidArgument(field: string): never {
  throw new ToolRefusal(`Dữ liệu không hợp lệ: ${field}`);
}

const NEEDS_CONFIRMATION_ERROR =
  'Chưa làm: lượt này có dữ liệu đọc từ ảnh hoặc từ thành viên nên việc này cần quản lý xác nhận. Không gọi lại trong lượt này và không nói là đã làm. Hỏi quản lý một câu: nêu đúng việc, người hoặc thứ bị tác động và điều việc này ảnh hưởng, rồi xin một câu "có". Nếu nhiều người hoặc thứ cùng khớp, hỏi là người hoặc thứ nào, không đoán.';

const CONFIRMATION_DETAILS: Partial<Record<GuardedTool, string>> = {
  rewrite_member_plate: ' Nêu cả biển số cũ và biển số mới.',
  save_document_template: ' Nêu rằng các giấy tờ đã lưu sẽ được đọc lại và tốn credit.',
};

export function buildConfirmationError(tool: GuardedTool): string {
  return `${NEEDS_CONFIRMATION_ERROR}${CONFIRMATION_DETAILS[tool] ?? ''}`;
}
