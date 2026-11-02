import { describe, expect, it } from 'vitest';
import { saveAgreedReading } from '../../../src/app/reading/save-agreed-reading.ts';
import { makeItem, makeReading } from './make-reading.ts';

describe('saveAgreedReading', () => {
  it('keeps a detail both readers returned, ignoring case and accents', () => {
    const first = makeReading([makeItem({ details: [{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }] })]);
    const second = makeReading([makeItem({ details: [{ label: 'tên trạm', value: 'PETROLIMEX LONG BIEN' }] })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.details).toEqual([{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }]);
  });

  it('drops a detail only one reader returned', () => {
    const first = makeReading([makeItem({ details: [{ label: 'Số lít', value: '50' }] })]);
    const second = makeReading([makeItem({ details: [] })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.details).toEqual([]);
  });

  it('keeps the item order of the first reader', () => {
    const toll = makeItem({ category: 'toll', document_number: 'A1' });
    const fuel = makeItem({ category: 'fuel', document_number: 'B2' });

    const saved = saveAgreedReading(makeReading([toll, fuel]), makeReading([fuel, toll]));

    expect(saved.items.map((item) => item.category)).toEqual(['toll', 'fuel']);
  });
});
