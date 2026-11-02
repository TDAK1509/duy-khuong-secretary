import type { ReaderRequest, ReaderService } from '../../services/reading/reader-service.ts';
import { areAgreeing } from './agreement.ts';
import { validateReading, type ReadAttempt, type Reading } from './reading.ts';

export type ReaderPair = readonly [ReaderService, ReaderService];
export type ReaderSlots = { cheap: ReaderPair; strong: ReaderPair };
export type AttemptPair = readonly [ReadAttempt, ReadAttempt];
export type AgreedReadings = readonly [Reading, Reading];

export type ReadingDecision = {
  outcome: 'cheap_pair' | 'expensive_pair' | 'unresolved';
  cheap: AttemptPair;
  strong: AttemptPair | null;
  agreed: AgreedReadings | null;
};

export async function decideReading(slots: ReaderSlots, request: ReaderRequest): Promise<ReadingDecision> {
  const cheap = await readWithPair(slots.cheap, request);
  const agreedCheap = pickAgreedReadings(cheap);
  if (agreedCheap) return { outcome: 'cheap_pair', cheap, strong: null, agreed: agreedCheap };
  const strong = await readWithPair(slots.strong, request);
  const agreedStrong = pickAgreedReadings(strong);
  if (agreedStrong) return { outcome: 'expensive_pair', cheap, strong, agreed: agreedStrong };
  return { outcome: 'unresolved', cheap, strong, agreed: null };
}

function pickAgreedReadings(attempts: AttemptPair): AgreedReadings | null {
  const [first, second] = attempts;
  return first.ok && second.ok && areAgreeing(first, second) ? [first.reading, second.reading] : null;
}

async function readWithPair(pair: ReaderPair, request: ReaderRequest): Promise<AttemptPair> {
  const [first, second] = pair;
  return Promise.all([readOnce(first, request), readOnce(second, request)]);
}

async function readOnce(reader: ReaderService, request: ReaderRequest): Promise<ReadAttempt> {
  const result = await reader.read(request);
  return result.ok ? validateReading(result.json) : result;
}
