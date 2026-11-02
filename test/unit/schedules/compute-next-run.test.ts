import { describe, expect, it } from 'vitest';
import { computeNextRun } from '../../../src/app/schedules/compute-next-run.ts';

describe('computeNextRun', () => {
  it('runs a daily task today when its time is still ahead', () => {
    const now = new Date('2026-10-31T10:00:00+07:00');

    const nextRun = computeNextRun({ repeat: 'daily', timeOfDay: '18:00' }, now);

    expect(nextRun).toEqual(new Date('2026-10-31T18:00:00+07:00'));
  });

  it('runs a daily task tomorrow when its time has passed', () => {
    const now = new Date('2026-10-31T19:00:00+07:00');

    const nextRun = computeNextRun({ repeat: 'daily', timeOfDay: '18:00' }, now);

    expect(nextRun).toEqual(new Date('2026-11-01T18:00:00+07:00'));
  });

  it('runs a weekly task on the next matching weekday', () => {
    const saturdayMorning = new Date('2026-10-31T10:00:00+07:00');

    const nextRun = computeNextRun({ repeat: 'weekly', timeOfDay: '07:00', weekday: 1 }, saturdayMorning);

    expect(nextRun).toEqual(new Date('2026-11-02T07:00:00+07:00'));
  });
});
