export const REFUSAL_ERROR = 'Không có quyền.';
export const MEMBER_NOT_FOUND_ERROR = 'Không tìm thấy thành viên có mã này. Mã thành viên phải lấy từ list_members: gọi list_members, chọn đúng người rồi gọi lại. Không hỏi quản lý mã.';
export const CHANGE_REFUSED_ERROR =
  'Chưa làm: tin nhắn đi kèm dữ liệu đọc từ ảnh hoặc lượt này đã đọc dữ liệu do thành viên gửi. Không gọi lại. Hệ thống tự hướng dẫn quản lý.';
export const INVALID_CURSOR_ERROR = 'Con trỏ không hợp lệ.';
export const INVALID_DATE_ERROR = 'Ngày đã gửi không đúng. Ngày phải có dạng YYYY-MM-DD và có thật trong lịch, ví dụ 2026-10-31. Sửa ngày theo đúng dạng rồi gọi lại.';

export function failInvalidArgument(field: string): string {
  return failTool(`Dữ liệu không hợp lệ: ${field}`);
}

export function failTool(error: string): string {
  return JSON.stringify({ ok: false, error });
}

export class ToolRefusal extends Error {}

export function refuseInvalidArgument(field: string): never {
  throw new ToolRefusal(`Dữ liệu không hợp lệ: ${field}`);
}
