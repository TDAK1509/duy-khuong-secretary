import type { Schedule } from './schedule.ts';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

export function computeNextRun(schedule: Schedule, now: Date): Date {
  const today = findVietnamDay(now);
  const todayRun = atVietnamTime(today, schedule.timeOfDay);
  return todayRun > now ? todayRun : atVietnamTime(addDays(today, 1), schedule.timeOfDay);
}

type VietnamDay = { year: number; month: number; day: number };

function findVietnamDay(instant: Date): VietnamDay {
  return readUtcDay(new Date(instant.getTime() + VIETNAM_OFFSET_MS));
}

function addDays({ year, month, day }: VietnamDay, days: number): VietnamDay {
  return readUtcDay(new Date(Date.UTC(year, month - 1, day + days)));
}

function readUtcDay(date: Date): VietnamDay {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function atVietnamTime({ year, month, day }: VietnamDay, timeOfDay: string): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS);
}
