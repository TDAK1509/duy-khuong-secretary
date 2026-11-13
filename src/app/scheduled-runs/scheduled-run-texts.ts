export const NOTHING_TO_REPORT = 'KHONG_CO_THONG_BAO';

export function describeFailedRun(taskTitle: string): string {
  return `Lịch "${taskTitle}" chạy lỗi. Lần chạy sau sẽ thử lại.`;
}

export function describeSkippedRun(taskTitle: string): string {
  return `Lịch "${taskTitle}" chưa chạy vì nhóm đã hết credit. Lần chạy sau sẽ thử lại.`;
}

export function labelAnswer(taskTitle: string, answer: string): string {
  if (answer.trim() === NOTHING_TO_REPORT) return answer;
  return `Lịch "${taskTitle}":\n${answer}`;
}
