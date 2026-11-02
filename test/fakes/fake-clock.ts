import type { Clock } from '../../src/services/clock/clock.ts';

export class FakeClock implements Clock {
  private readonly current: Date;

  constructor(current: Date) {
    this.current = current;
  }

  now(): Date {
    return this.current;
  }
}
