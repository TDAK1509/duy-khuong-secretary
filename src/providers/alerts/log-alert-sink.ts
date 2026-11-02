import type { AlertSink } from '../../services/alerts/alert-sink.ts';

export class LogAlertSink implements AlertSink {
  async notify(text: string): Promise<void> {
    console.error(text);
  }
}
