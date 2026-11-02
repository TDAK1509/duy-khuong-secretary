import { describe, expect, it } from 'vitest';
import { areAgreeing } from '../../../src/app/reading/agreement.ts';
import { makeItem, makeReading, succeed } from './make-reading.ts';

describe('areAgreeing', () => {
  it('agrees on two identical readings', () => {
    const item = makeItem({ document_number: '0001234' });

    const agree = areAgreeing(succeed(makeReading([item])), succeed(makeReading([item])));

    expect(agree).toBe(true);
  });

  it('disagrees when the amounts differ', () => {
    const first = succeed(makeReading([makeItem({ amount_vnd: 1250000 })]));
    const second = succeed(makeReading([makeItem({ amount_vnd: 1520000 })]));

    expect(areAgreeing(first, second)).toBe(false);
  });

  it('agrees when identifiers differ only in case and punctuation', () => {
    const first = succeed(makeReading([makeItem({ identifiers: ['DT2024-889'] })]));
    const second = succeed(makeReading([makeItem({ identifiers: ['dt2024 889'] })]));

    expect(areAgreeing(first, second)).toBe(true);
  });

  it('agrees when maintenance items differ only in accents and case', () => {
    const first = succeed(makeReading([makeItem({ category: 'maintenance', maintenance_item: 'Dầu máy' })]));
    const second = succeed(makeReading([makeItem({ category: 'maintenance', maintenance_item: 'dau may' })]));

    expect(areAgreeing(first, second)).toBe(true);
  });

  it('agrees on the same items in a different order', () => {
    const toll = makeItem({ category: 'toll', amount_vnd: 90000 });
    const fuel = makeItem({ category: 'fuel', amount_vnd: 1250000 });

    const agree = areAgreeing(succeed(makeReading([toll, fuel])), succeed(makeReading([fuel, toll])));

    expect(agree).toBe(true);
  });
});
