import { describe, expect, it } from 'vitest';
import { OncePerHour } from '../../src/app/alerts/once-per-hour.ts';
import { FakeClock } from '../fakes/fake-clock.ts';

const HOUR_MS = 60 * 60 * 1000;

describe('OncePerHour', () => {
  it('forgets texts that are older than an hour', () => {
    const clock = new FakeClock(new Date('2026-11-02T10:00:00+07:00'));
    const oncePerHour = new OncePerHour(clock);
    for (let index = 0; index < 100; index += 1) oncePerHour.allow(`text ${index}`);

    clock.advanceBy(HOUR_MS);
    oncePerHour.allow('a new text');

    expect(oncePerHour.countRemembered()).toBe(1);
  });
});
