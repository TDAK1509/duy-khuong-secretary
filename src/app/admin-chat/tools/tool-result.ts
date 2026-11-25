import { z } from 'zod';

export const REFUSAL_ERROR = 'Không có quyền.';
export const MEMBER_NOT_FOUND_ERROR = 'Không tìm thấy thành viên có mã này. Mã thành viên phải lấy từ list_members: gọi list_members, chọn đúng người rồi gọi lại. Không hỏi quản lý mã.';
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

export function failFromError(error: unknown): string {
  if (error instanceof z.ZodError) return failInvalidArgument(String(error.issues[0]?.path[0] ?? 'arguments'));
  if (error instanceof ToolRefusal) return failTool(error.message);
  if (error instanceof SyntaxError) return failInvalidArgument('arguments');
  throw error;
}

const WAITING_NOTE = 'Việc này chưa làm: đang chờ quản lý xác nhận. Máy chủ tự hỏi quản lý. Không viết câu hỏi xác nhận, không gọi lại và không nói là đã làm.';

export function buildWaitingResult(): string {
  return JSON.stringify({ ok: true, waiting_for_admin: true, note: WAITING_NOTE });
}
