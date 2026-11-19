export const SHEET_OVERSIZED_TEXT = 'File quá lớn, tối đa 5 MB.';

export const SHEET_NON_ADMIN_TEXT = 'Chỉ quản trị viên mới gửi được file dữ liệu.';

export const SHEET_TOO_MANY_FILES_TEXT = 'Vui lòng gửi từng file một.';

export const SHEET_NOT_DOWNLOADED_TEXT = 'Không tải được file này. Vui lòng gửi lại. Nếu vẫn không được, báo cho người quản trị hệ thống.';

export const SHEET_NOT_READABLE_TEXT = 'File này không phải file Excel (.xlsx) hoặc CSV đọc được. Kiểm tra lại file rồi gửi lại.';

export function formatSheetReceipt(fileName: string, fileSizeBytes: number): string {
  return `Đã nhận file "${fileName}" (${toKilobytes(fileSizeBytes)} KB).`;
}

export type FoundHeaders = { rowCount: number; headers: string[]; headerRowNumber: number };

export function formatHeadersFound(fileName: string, { rowCount, headers, headerRowNumber }: FoundHeaders): string {
  const headerNote = headerRowNumber === 1 ? '' : ` (dòng tiêu đề: ${headerRowNumber})`;
  return `File "${fileName}" có ${rowCount} dòng dữ liệu với các cột${headerNote}: ${headers.filter((header) => header !== '').join(', ')}.`;
}

export const MAX_SHEET_ROWS = 5000;

export function formatTooManyRows(fileName: string, maxRows: number): string {
  return `File "${fileName}" có hơn ${maxRows} dòng dữ liệu. Vui lòng chia thành nhiều file nhỏ hơn rồi gửi lại.`;
}

export function formatNoDataRows(fileName: string): string {
  return `File "${fileName}" không có dòng dữ liệu.`;
}

export function formatParseFailure(fileName: string): string {
  return `File "${fileName}" không đọc được. Kiểm tra định dạng và gửi lại.`;
}

export const SHEET_CAPTION_USED_TEXT = 'Đã đọc theo ghi chú kèm file.';
export const SHEET_READER_FAILURE_TEXT = 'Trợ lý không đọc được file. Gửi lại hoặc kiểm tra định dạng.';

export type SheetResult = { kind: string; added: number; updated: number; skipped: number[]; duplicates: number[] };

export function formatSheetResult({ kind, added, updated, skipped, duplicates }: SheetResult): string {
  const skippedCount = skipped.length + duplicates.length;
  const details = [skipped.length > 0 ? `dòng ${skipped.join(', ')}` : '', duplicates.length > 0 ? `trùng: dòng ${duplicates.join(', ')}` : ''].filter((part) => part !== '').join('; ');
  return `Chứng từ "${kind}": ${added} dòng mới, ${updated} dòng cập nhật, ${skippedCount} dòng bỏ qua${details === '' ? '' : ` (${details})`}.`;
}

function toKilobytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
