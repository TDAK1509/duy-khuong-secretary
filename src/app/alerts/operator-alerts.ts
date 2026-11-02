import type { AlertSink } from '../../services/alerts/alert-sink.ts';
import type { Clock } from '../../services/clock/clock.ts';

const SAME_ALERT_INTERVAL_MS = 60 * 60 * 1000;

export class OperatorAlerts {
  private readonly sink: AlertSink;
  private readonly clock: Clock;
  private readonly lastSentAt = new Map<string, number>();

  constructor(sink: AlertSink, clock: Clock) {
    this.sink = sink;
    this.clock = clock;
  }

  async raise(text: string): Promise<void> {
    if (this.wasSentRecently(text)) return;
    this.lastSentAt.set(text, this.clock.now().getTime());
    try {
      await this.sink.notify(text);
    } catch (error) {
      console.error('[alerts] the alert sink failed:', error instanceof Error ? error.name : 'unknown error');
    }
  }

  private wasSentRecently(text: string): boolean {
    const sentAt = this.lastSentAt.get(text);
    return sentAt !== undefined && this.clock.now().getTime() - sentAt < SAME_ALERT_INTERVAL_MS;
  }
}
