export interface AlertSink {
  notify(text: string): Promise<void>;
}
