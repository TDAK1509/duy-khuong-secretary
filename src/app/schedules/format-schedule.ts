import { formatVietnamDateTime } from '../workspaces/format-expiry.ts';
import type { Schedule } from './schedule.ts';

const WEEKDAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];

export function formatSchedule(schedule: Schedule): string {
  switch (schedule.repeat) {
    case 'once':
      return `${formatVietnamDateTime(schedule.runOnceAt)} (một lần)`;
    case 'daily':
      return `${schedule.timeOfDay} hằng ngày`;
    case 'weekly':
      return `${schedule.timeOfDay} ${WEEKDAY_NAMES[schedule.weekday - 1]} hằng tuần`;
    case 'monthly':
      return `${schedule.timeOfDay} ngày ${schedule.dayOfMonth} hằng tháng`;
  }
}
