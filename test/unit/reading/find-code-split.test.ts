import { describe, expect, it } from 'vitest';
import type { ReadingDecision } from '../../../src/app/reading/decide-reading.ts';
import { findCodeSplit } from '../../../src/app/reading/find-code-split.ts';
import type { ReadAttempt, Reading, ReadingItem } from '../../../src/app/reading/reading.ts';
import { makeItem, makeReading, succeed } from './make-reading.ts';

const CHEAP_DISAGREEMENT = [succeed(makeReading([makeItem({ amount_vnd: 1 })])), succeed(makeReading([makeItem({ amount_vnd: 2 })]))] as const;

describe('findCodeSplit', () => {
  it('gives two candidates when the strong readers differ only in one code of one item', () => {
    const decision = decideOnStrong(
      makeReading([makeTire({ identifiers: ['8936012345678'] })]),
      makeReading([makeTire({ identifiers: ['8936012845678'] })]),
    );

    const split = findCodeSplit(decision);

    expect(split?.codes).toEqual(['8936012345678', '8936012845678']);
    expect(split?.reading.items.map((item) => item.identifiers)).toEqual([[]]);
  });

  it('keeps a code both strong readers read on the item and does not offer it', () => {
    const decision = decideOnStrong(
      makeReading([makeTire({ identifiers: ['SN-001', 'A1'] })]),
      makeReading([makeTire({ identifiers: ['SN001', 'B1'] })]),
    );

    const split = findCodeSplit(decision);

    expect(split?.codes).toEqual(['A1', 'B1']);
    expect(split?.reading.items.map((item) => item.identifiers)).toEqual([['SN-001']]);
  });
});

function decideOnStrong(first: ReadAttempt | Reading, second: ReadAttempt | Reading): ReadingDecision {
  return { outcome: 'unresolved', cheap: CHEAP_DISAGREEMENT, strong: [toAttempt(first), toAttempt(second)], agreed: null };
}

function toAttempt(reader: ReadAttempt | Reading): ReadAttempt {
  return 'ok' in reader ? reader : succeed(reader);
}

function makeTire(overrides: Partial<ReadingItem> = {}): ReadingItem {
  return makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null, ...overrides });
}
