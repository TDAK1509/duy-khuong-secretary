export const REFUSAL_ERROR = 'Không có quyền.';
export const CHANGE_REFUSED_ERROR =
  'Chưa làm: tin nhắn có ảnh hoặc lượt này đã đọc dữ liệu do thành viên gửi. Không gọi lại. Hệ thống tự hướng dẫn quản lý.';
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
