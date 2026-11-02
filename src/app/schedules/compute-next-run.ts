import type { Schedule } from './schedule.ts';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

export function computeNextRun(schedule: Schedule, now: Date): Date {
  const today = findVietnamDay(now);
  return atVietnamTime(today, schedule.timeOfDay);
}

type VietnamDay = { year: number; month: number; day: number };

function findVietnamDay(instant: Date): VietnamDay {
  const shifted = new Date(instant.getTime() + VIETNAM_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function atVietnamTime({ year, month, day }: VietnamDay, timeOfDay: string): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS);
}
