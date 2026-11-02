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
});
