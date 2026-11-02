import type { AlertSink } from '../../src/services/alerts/alert-sink.ts';

export class FakeAlertSink implements AlertSink {
  readonly texts: string[] = [];

  async notify(text: string): Promise<void> {
    this.texts.push(text);
  }
}
