export function describeFailedRun(taskTitle: string): string {
  return `Lịch "${taskTitle}" chạy lỗi. Lần chạy sau sẽ thử lại.`;
}
