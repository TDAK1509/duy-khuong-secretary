import type { RepeatingSchedule, Schedule } from './schedule.ts';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAYS_IN_WEEK = 7;

type VietnamDay = { year: number; month: number; day: number; weekday: number };

export function computeNextRun(schedule: Schedule, now: Date): Date | null {
  return listCandidateRuns(schedule, now).find((run) => run > now) ?? null;
}

function listCandidateRuns(schedule: Schedule, now: Date): Date[] {
  if (schedule.repeat === 'once') return [schedule.runOnceAt];
  return listCandidateDays(schedule, findVietnamDay(now)).map((day) => atVietnamTime(day, schedule.timeOfDay));
}

function listCandidateDays(schedule: RepeatingSchedule, today: VietnamDay): VietnamDay[] {
  switch (schedule.repeat) {
    case 'daily':
      return [today, addDays(today, 1)];
    case 'weekly': {
      const daysAhead = (schedule.weekday - today.weekday + DAYS_IN_WEEK) % DAYS_IN_WEEK;
      return [addDays(today, daysAhead), addDays(today, daysAhead + DAYS_IN_WEEK)];
    }
    case 'monthly':
      return [0, 1].map((monthsAhead) => findDayOfMonth(today, monthsAhead, schedule.dayOfMonth));
  }
}

function findVietnamDay(instant: Date): VietnamDay {
  return readUtcDay(new Date(instant.getTime() + VIETNAM_OFFSET_MS));
}

function addDays({ year, month, day }: VietnamDay, days: number): VietnamDay {
  return readUtcDay(new Date(Date.UTC(year, month - 1, day + days)));
}

function findDayOfMonth({ year, month }: VietnamDay, monthsAhead: number, dayOfMonth: number): VietnamDay {
  return readUtcDay(new Date(Date.UTC(year, month - 1 + monthsAhead, dayOfMonth)));
}

function readUtcDay(date: Date): VietnamDay {
  const weekday = date.getUTCDay() === 0 ? DAYS_IN_WEEK : date.getUTCDay();
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday };
}

function atVietnamTime({ year, month, day }: VietnamDay, timeOfDay: string): Date {
  const [hours, minutes] = timeOfDay.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - VIETNAM_OFFSET_MS);
}
