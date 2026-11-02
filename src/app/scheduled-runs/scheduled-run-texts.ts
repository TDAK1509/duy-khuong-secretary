export const NOTHING_TO_REPORT = 'KHONG_CO_THONG_BAO';

export function describeFailedRun(taskTitle: string): string {
  return `Lịch "${taskTitle}" chạy lỗi. Lần chạy sau sẽ thử lại.`;
}
