import { describe, expect, it } from 'vitest';
import { isDuplicateRecord, type DuplicateFields } from '../../../src/app/records/is-duplicate-record.ts';

function makeFields(overrides: Partial<DuplicateFields> = {}): DuplicateFields {
  return {
    category: 'đổ xăng dầu',
    documentTitle: null,
    maintenanceItem: null,
    vehiclePlate: null,
    documentNumber: '0001234',
    occurredOn: '2026-10-30',
    amountVnd: 1250000,
    identifiers: [],
    details: [],
    ...overrides,
  };
}

describe('isDuplicateRecord', () => {
  it('finds an item whose saved fields all equal a record a duplicate', () => {
    const details = [{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }];

    expect(isDuplicateRecord(makeFields({ details }), makeFields({ details }))).toBe(true);
  });

  it('finds an item with another document number not a duplicate', () => {
    expect(isDuplicateRecord(makeFields(), makeFields({ documentNumber: '0001235' }))).toBe(false);
  });

  it('finds an item with another amount not a duplicate', () => {
    expect(isDuplicateRecord(makeFields(), makeFields({ amountVnd: 1520000 }))).toBe(false);
  });

  it('finds an item with another plate not a duplicate', () => {
    const oilChange = makeFields({
      category: 'bảo dưỡng',
      maintenanceItem: 'dầu máy',
      vehiclePlate: '29C12345',
      documentNumber: null,
      occurredOn: '2026-10-01',
      amountVnd: 850000,
    });

    expect(isDuplicateRecord(oilChange, { ...oilChange, vehiclePlate: '29C12346' })).toBe(false);
  });

  it('finds an item with the same details in another order a duplicate', () => {
    const stationThenLiters = [
      { label: 'Tên trạm', value: 'A' },
      { label: 'Số lít', value: '50' },
    ];

    expect(
      isDuplicateRecord(
        makeFields({ details: stationThenLiters }),
        makeFields({ details: [...stationThenLiters].reverse() }),
      ),
    ).toBe(true);
  });

  it('finds an item whose details differ only in case and accents a duplicate', () => {
    const existing = makeFields({ details: [{ label: 'Tên trạm', value: 'Petrolimex Long Biên' }] });
    const candidate = makeFields({ details: [{ label: 'tên trạm', value: 'PETROLIMEX LONG BIEN' }] });

    expect(isDuplicateRecord(existing, candidate)).toBe(true);
  });

  it('finds an item with one extra detail pair not a duplicate', () => {
    const station = { label: 'Tên trạm', value: 'A' };
    const liters = { label: 'Số lít', value: '50' };

    expect(isDuplicateRecord(makeFields({ details: [station] }), makeFields({ details: [station, liters] }))).toBe(false);
  });

  it('finds two tolls without a document number and otherwise equal a duplicate', () => {
    const toll = makeFields({ category: 'phí cầu đường', documentNumber: null, amountVnd: 35000 });

    expect(isDuplicateRecord(toll, { ...toll })).toBe(true);
  });

  it('finds an item with a document number on one side only not a duplicate', () => {
    const toll = makeFields({ category: 'phí cầu đường', documentNumber: null, amountVnd: 35000 });

    expect(isDuplicateRecord(toll, { ...toll, documentNumber: '0012345' })).toBe(false);
  });

  it('finds two records whose titles differ not a duplicate', () => {
    const existing = makeFields({ documentTitle: 'Hóa đơn bán lẻ xăng dầu' });

    expect(isDuplicateRecord(existing, makeFields({ documentTitle: 'Biên lai thu phí' }))).toBe(false);
  });

  it('finds two records with a title on one side only not a duplicate', () => {
    const existing = makeFields({ documentTitle: 'Hóa đơn bán lẻ xăng dầu' });

    expect(isDuplicateRecord(existing, makeFields({ documentTitle: null }))).toBe(false);
  });

  it('finds two records with the same title a duplicate', () => {
    const existing = makeFields({ documentTitle: 'Hóa đơn bán lẻ xăng dầu' });

    expect(isDuplicateRecord(existing, { ...existing })).toBe(true);
  });

  it('finds an item with another date not a duplicate', () => {
    expect(isDuplicateRecord(makeFields(), makeFields({ occurredOn: '2026-10-31' }))).toBe(false);
  });

  it('finds an item with other identifiers not a duplicate', () => {
    expect(isDuplicateRecord(makeFields({ identifiers: ['DT2024889'] }), makeFields({ identifiers: ['DT2024890'] }))).toBe(
      false,
    );
  });

  it('finds an item whose maintenance item differs only in accents a duplicate', () => {
    const oilChange = makeFields({ category: 'bảo dưỡng', maintenanceItem: 'dầu máy', vehiclePlate: '29C12345' });

    expect(isDuplicateRecord(oilChange, { ...oilChange, maintenanceItem: 'dau may' })).toBe(true);
  });

  it('finds an item with another maintenance item not a duplicate', () => {
    const oilChange = makeFields({ category: 'bảo dưỡng', maintenanceItem: 'dầu máy', vehiclePlate: '29C12345' });

    expect(isDuplicateRecord(oilChange, { ...oilChange, maintenanceItem: 'lốp' })).toBe(false);
  });
});
