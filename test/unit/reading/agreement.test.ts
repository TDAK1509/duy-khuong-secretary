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

  it('agrees when plates differ only in case and punctuation', () => {
    const first = succeed(makeReading([makeItem({ vehicle_plate: '29C-123.45' })]));
    const second = succeed(makeReading([makeItem({ vehicle_plate: '29c12345' })]));

    expect(areAgreeing(first, second)).toBe(true);
  });

  it('disagrees when the plates differ', () => {
    const first = succeed(makeReading([makeItem({ vehicle_plate: '29C12345' })]));
    const second = succeed(makeReading([makeItem({ vehicle_plate: '29C12346' })]));

    expect(areAgreeing(first, second)).toBe(false);
  });

  it('disagrees when only one reader returned a plate', () => {
    const first = succeed(makeReading([makeItem({ vehicle_plate: '29C-123.45' })]));
    const second = succeed(makeReading([makeItem({ vehicle_plate: null })]));

    expect(areAgreeing(first, second)).toBe(false);
  });

  it('never treats the letter O and the digit 0 as equal', () => {
    const first = succeed(makeReading([makeItem({ vehicle_plate: '29C-1O3.45' })]));
    const second = succeed(makeReading([makeItem({ vehicle_plate: '29C-103.45' })]));

    expect(areAgreeing(first, second)).toBe(false);
  });
});
