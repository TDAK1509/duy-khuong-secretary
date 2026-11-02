import type { AlertSink } from '../../services/alerts/alert-sink.ts';

export class OperatorAlerts {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async raise(text: string): Promise<void> {
    try {
      await this.sink.notify(text);
    } catch (error) {
      console.error('[alerts] the alert sink failed:', error instanceof Error ? error.name : 'unknown error');
    }
  }
}
