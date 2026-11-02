export function formatSavedText(title: string, firstRun: string): string {
  return `Đã lưu lịch "${title}". Lần chạy đầu: ${firstRun}.`;
}

export function formatCancelledText(title: string): string {
  return `Đã hủy lịch nháp "${title}".`;
}

export const RUN_TIME_PASSED_TEXT = 'Thời điểm chạy đã qua. Nhắn lại cho Trợ lý để đặt giờ khác.';
