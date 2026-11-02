import type { Clock } from '../../services/clock/clock.ts';

const INTERVAL_MS = 60 * 60 * 1000;

export class OncePerHour {
  private readonly clock: Clock;
  private readonly lastAllowedAt = new Map<string, number>();

  constructor(clock: Clock) {
    this.clock = clock;
  }

  allow(text: string): boolean {
    const now = this.clock.now().getTime();
    const lastAt = this.lastAllowedAt.get(text);
    if (lastAt !== undefined && now - lastAt < INTERVAL_MS) return false;
    this.lastAllowedAt.set(text, now);
    return true;
  }
}
