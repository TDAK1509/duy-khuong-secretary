import type { ReaderRequest, ReaderService } from '../../services/reading/reader-service.ts';
import { validateReading, type ReadAttempt } from './reading.ts';

export type ReaderPair = readonly [ReaderService, ReaderService];
export type ReaderSlots = { cheap: ReaderPair; strong: ReaderPair };
export type AttemptPair = readonly [ReadAttempt, ReadAttempt];

export type ReadingDecision = {
  outcome: 'cheap_pair' | 'expensive_pair' | 'unresolved';
  cheap: AttemptPair;
  strong: AttemptPair | null;
};

export async function decideReading(slots: ReaderSlots, request: ReaderRequest): Promise<ReadingDecision> {
  const cheap = await readWithPair(slots.cheap, request);
  return { outcome: 'cheap_pair', cheap, strong: null };
}

async function readWithPair(pair: ReaderPair, request: ReaderRequest): Promise<AttemptPair> {
  const [first, second] = pair;
  return Promise.all([readOnce(first, request), readOnce(second, request)]);
}

async function readOnce(reader: ReaderService, request: ReaderRequest): Promise<ReadAttempt> {
  const result = await reader.read(request);
  return result.ok ? validateReading(result.json) : result;
}
