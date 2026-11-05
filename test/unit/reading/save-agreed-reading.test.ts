import { describe, expect, it } from 'vitest';
import { saveAgreedReading } from '../../../src/app/reading/save-agreed-reading.ts';
import { makeFuelItemX, makeItem, makeReading } from './make-reading.ts';

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
    const toll = makeItem({ category: 'phí cầu đường', document_number: 'A1' });
    const fuel = makeItem({ category: 'đổ xăng dầu', document_number: 'B2' });

    const saved = saveAgreedReading(makeReading([toll, fuel]), makeReading([fuel, toll]));

    expect(saved.items.map((item) => item.category)).toEqual(['phí cầu đường', 'đổ xăng dầu']);
  });

  it('saves the category as khác when the readers word it differently', () => {
    const first = makeReading([makeFuelItemX({ category: 'đổ xăng dầu' })]);
    const second = makeReading([makeFuelItemX({ category: 'đổ dầu' })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.category).toBe('khác');
  });

  it('saves the category as khác when both readers leave it blank', () => {
    const first = makeReading([makeFuelItemX({ category: '  ' })]);
    const second = makeReading([makeFuelItemX({ category: '' })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.category).toBe('khác');
  });

  it('keeps the category both readers share, ignoring case and accents', () => {
    const first = makeReading([makeFuelItemX({ category: 'Kiểm định xe' })]);
    const second = makeReading([makeFuelItemX({ category: 'kiem dinh xe' })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.category).toBe('Kiểm định xe');
  });

  it('saves no title when the readers copy it differently', () => {
    const first = makeReading([makeFuelItemX({ document_title: 'Chứng nhận kiểm định' })]);
    const second = makeReading([makeFuelItemX({ document_title: 'Giấy chứng nhận kiểm định' })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.document_title).toBeNull();
  });

  it('keeps the title both readers copy, ignoring case and accents', () => {
    const first = makeReading([makeFuelItemX({ document_title: 'Hóa đơn bán lẻ xăng dầu' })]);
    const second = makeReading([makeFuelItemX({ document_title: 'hoa don ban le xang dau' })]);

    const saved = saveAgreedReading(first, second);

    expect(saved.items[0]?.document_title).toBe('Hóa đơn bán lẻ xăng dầu');
  });

  it('pairs items with the same fixed fields by category, so a title stays with its own item', () => {
    const fuel = makeFuelItemX({ category: 'đổ xăng dầu', document_title: 'Hóa đơn bán lẻ xăng dầu' });
    const toll = makeFuelItemX({ category: 'phí cầu đường', document_title: null });

    const saved = saveAgreedReading(makeReading([fuel, toll]), makeReading([toll, fuel]));

    expect(saved.items.map((item) => [item.category, item.document_title])).toEqual([
      ['đổ xăng dầu', 'Hóa đơn bán lẻ xăng dầu'],
      ['phí cầu đường', null],
    ]);
  });
});
