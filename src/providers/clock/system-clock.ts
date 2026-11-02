import type { Clock } from '../../services/clock/clock.ts';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
