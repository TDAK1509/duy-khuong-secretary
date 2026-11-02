import type { AlertSink } from '../../services/alerts/alert-sink.ts';

const WEBHOOK_TIMEOUT_MS = 10_000;

export class WebhookAlertSink implements AlertSink {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  async notify(text: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`alert webhook answered ${response.status}`);
  }
}
