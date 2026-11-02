import type { AlertSink } from '../../services/alerts/alert-sink.ts';
import type { Clock } from '../../services/clock/clock.ts';
import { OncePerHour } from './once-per-hour.ts';

export class OperatorAlerts {
  private readonly sink: AlertSink;
  private readonly oncePerHour: OncePerHour;

  constructor(sink: AlertSink, clock: Clock) {
    this.sink = sink;
    this.oncePerHour = new OncePerHour(clock);
  }

  async raise(text: string): Promise<void> {
    if (!this.oncePerHour.allow(text)) return;
    try {
      await this.sink.notify(text);
    } catch (error) {
      console.error('[alerts] could not send alert:', text, describeFailure(error));
    }
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') return `HTTP ${error.status}`;
  return error instanceof Error ? error.name : 'unknown error';
}
