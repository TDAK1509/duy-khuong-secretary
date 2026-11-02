import { isRealIsoDate } from '../../time/is-real-iso-date.ts';
import type { Schedule } from '../../schedules/schedule.ts';
import { refuseInvalidArgument, ToolRefusal } from './tool-result.ts';

export type ProposedSchedule = {
  repeat: 'once' | 'daily' | 'weekly' | 'monthly';
  run_once_at: string | null;
  time_of_day: string | null;
};

const RUN_ONCE_AT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readProposedSchedule(proposed: ProposedSchedule): Schedule {
  if (proposed.repeat === 'once') return { repeat: 'once', runOnceAt: readRunOnceAt(proposed.run_once_at) };
  return { repeat: 'daily', timeOfDay: readTimeOfDay(proposed.time_of_day) };
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
