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
    if (window === undefined || this.hasExpired(window, nowMs)) {
      this.deleteExpiredWindows(nowMs);
      this.windows.set(key, { startedAtMs: nowMs, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }

  countTrackedKeys(): number {
    return this.windows.size;
  }

  private hasExpired(window: RequestWindow, nowMs: number): boolean {
    return nowMs - window.startedAtMs >= this.windowMs;
  }

  private deleteExpiredWindows(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (this.hasExpired(window, nowMs)) this.windows.delete(key);
    }
  }
}
