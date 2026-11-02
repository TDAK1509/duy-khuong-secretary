import type { Clock } from '../../services/clock/clock.ts';
import { OncePerHour } from '../alerts/once-per-hour.ts';

export class OffGroupNotices {
  private readonly oncePerHour: OncePerHour;
  private readonly log: (line: string) => void;

  constructor(clock: Clock, log: (line: string) => void) {
    this.oncePerHour = new OncePerHour(clock);
    this.log = log;
  }

  announce(group: string): void {
    const line = `[config] ${group} is off; events wait.`;
    if (this.oncePerHour.allow(line)) this.log(line);
  }
}
