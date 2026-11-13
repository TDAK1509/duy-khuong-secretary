import { describe, expect, it } from 'vitest';
import { RequestRateLimit } from '../../../src/app/internal-admin/request-rate-limit.ts';

const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const START = new Date('2026-11-02T10:00:00+07:00');

describe('the request rate limit', () => {
  it('drops the expired windows of other keys when a key starts a new window', () => {
    const limiter = new RequestRateLimit(LIMIT, WINDOW_MS);
    for (let request = 0; request < LIMIT; request += 1) limiter.allows('A', START);
    limiter.allows('B', START);
    const afterWindow = new Date(START.getTime() + WINDOW_MS);

    const allowed = limiter.allows('A', afterWindow);

    expect(allowed).toBe(true);
    expect(limiter.countTrackedKeys()).toBe(1);
  });
});
