import type { Clock } from '../../src/services/clock/clock.ts';

export class FakeClock implements Clock {
  private current: Date;

  constructor(current: Date) {
    this.current = current;
  }

  now(): Date {
    return this.current;
  }

  setTo(moment: Date): void {
    this.current = moment;
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
