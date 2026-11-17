export const SHEET_OVERSIZED_TEXT = 'File quá lớn, tối đa 5 MB.';

export const SHEET_NON_ADMIN_TEXT = 'Chỉ quản trị viên mới gửi được file dữ liệu.';

export const SHEET_TOO_MANY_FILES_TEXT = 'Vui lòng gửi từng file một.';

export function formatSheetReceipt(fileName: string, fileSizeBytes: number): string {
  return `Đã nhận file "${fileName}" (${toKilobytes(fileSizeBytes)} KB).`;
}

function toKilobytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
