import type { Schedule } from './schedule.ts';

export type ScheduleRow = { repeat: string; time_of_day: string | null; weekday: number | null; day_of_month: number | null };

export const SCHEDULE_COLUMNS = `repeat, to_char(time_of_day, 'HH24:MI') AS time_of_day, weekday, day_of_month`;

export function readSchedule(row: ScheduleRow): Schedule {
  const timeOfDay = row.time_of_day ?? '';
  if (row.repeat === 'weekly') return { repeat: 'weekly', timeOfDay, weekday: row.weekday ?? 0 };
  if (row.repeat === 'monthly') return { repeat: 'monthly', timeOfDay, dayOfMonth: row.day_of_month ?? 0 };
  return { repeat: 'daily', timeOfDay };
}
