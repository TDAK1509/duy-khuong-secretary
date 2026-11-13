import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestRateLimit } from '../../../src/app/internal-admin/request-rate-limit.ts';

const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const START = new Date('2026-11-02T10:00:00+07:00');

describe('the request rate limit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops the expired windows of other keys when a key starts a new window', () => {
    const limiter = new RequestRateLimit(LIMIT, WINDOW_MS);
    for (let request = 0; request < LIMIT; request += 1) limiter.allows('A', START);
    limiter.allows('B', START);
    const afterWindow = new Date(START.getTime() + WINDOW_MS);

    const allowed = limiter.allows('A', afterWindow);

    expect(allowed).toBe(true);
    expect(limiter.countTrackedKeys()).toBe(1);
  });

  it('stops pruning at the first live window', () => {
    const limiter = new RequestRateLimit(LIMIT, WINDOW_MS);
    for (let address = 0; address < 1000; address += 1) limiter.allows(`address-${address}`, START);
    const entriesRead = countMapEntriesRead();

    limiter.allows('new-address', new Date(START.getTime() + 1));

    expect(entriesRead()).toBeLessThanOrEqual(1);
  });
});

function countMapEntriesRead(): () => number {
  const readEntries = Map.prototype[Symbol.iterator];
  let count = 0;
  vi.spyOn(Map.prototype, Symbol.iterator).mockImplementation(function (this: Map<unknown, unknown>) {
    const entries = readEntries.call(this);
    return { [Symbol.iterator]: () => entries, next: () => { count += 1; return entries.next(); } } as MapIterator<[unknown, unknown]>;
  });
  return () => count;
}
