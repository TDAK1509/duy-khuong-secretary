export const REFUSAL_ERROR = 'Không có quyền.';
export const INVALID_CURSOR_ERROR = 'Con trỏ không hợp lệ.';
export const INVALID_DATE_ERROR = 'Ngày không hợp lệ.';

export function failTool(error: string): string {
  return JSON.stringify({ ok: false, error });
}

export function failInvalidArgument(field: string): string {
  return failTool(`Dữ liệu không hợp lệ: ${field}`);
}
