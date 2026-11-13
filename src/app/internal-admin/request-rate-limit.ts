type RequestWindow = { startedAtMs: number; count: number };

export class RequestRateLimit {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, RequestWindow>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  allows(key: string, now: Date): boolean {
    const nowMs = now.getTime();
    const window = this.windows.get(key);
    if (window === undefined || nowMs - window.startedAtMs >= this.windowMs) {
      this.windows.set(key, { startedAtMs: nowMs, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }
}
