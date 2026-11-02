import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import type { Schedule } from '../../schedules/schedule.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';

export type ProposedSchedule = {
  repeat: 'once' | 'daily' | 'weekly' | 'monthly';
  run_once_at: string | null;
  time_of_day: string | null;
  weekday: number | null;
  day_of_month: number | null;
};

type ScheduleField = 'run_once_at' | 'time_of_day' | 'weekday' | 'day_of_month';

const UNUSED_FIELDS: Record<ProposedSchedule['repeat'], ScheduleField[]> = {
  once: ['time_of_day', 'weekday', 'day_of_month'],
  daily: ['run_once_at', 'weekday', 'day_of_month'],
  weekly: ['run_once_at', 'day_of_month'],
  monthly: ['run_once_at', 'weekday'],
};

const RUN_ONCE_AT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DAY_OF_MONTH = 28;
const DAYS_IN_WEEK = 7;

export function readProposedSchedule(proposed: ProposedSchedule): Schedule {
  for (const field of UNUSED_FIELDS[proposed.repeat]) if (proposed[field] !== null) refuseInvalidArgument(field);
  switch (proposed.repeat) {
    case 'once':
      return { repeat: 'once', runOnceAt: readRunOnceAt(proposed.run_once_at) };
    case 'daily':
      return { repeat: 'daily', timeOfDay: readTimeOfDay(proposed.time_of_day) };
    case 'weekly':
      return {
        repeat: 'weekly',
        timeOfDay: readTimeOfDay(proposed.time_of_day),
        weekday: readNumberBetween(proposed.weekday, 'weekday', DAYS_IN_WEEK),
      };
    case 'monthly':
      return {
        repeat: 'monthly',
        timeOfDay: readTimeOfDay(proposed.time_of_day),
        dayOfMonth: readNumberBetween(proposed.day_of_month, 'day_of_month', MAX_DAY_OF_MONTH),
      };
  }
}

function readRunOnceAt(text: string | null): Date {
  if (text === null) throw new ToolRefusal('Thiếu giờ chạy.');
  const [, date = '', time = ''] = RUN_ONCE_AT.exec(text) ?? [];
  if (!isRealIsoDate(date) || !TIME_OF_DAY.test(time)) return refuseInvalidArgument('run_once_at');
  return new Date(`${date}T${time}:00+07:00`);
}

function readTimeOfDay(text: string | null): string {
  if (text === null) throw new ToolRefusal('Thiếu giờ chạy.');
  if (!TIME_OF_DAY.test(text)) return refuseInvalidArgument('time_of_day');
  return text;
}

function readNumberBetween(value: number | null, field: string, max: number): number {
  if (value === null || value < 1 || value > max) return refuseInvalidArgument(field);
  return value;
}
