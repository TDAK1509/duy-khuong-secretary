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
});
