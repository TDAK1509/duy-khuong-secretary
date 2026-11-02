import { describe, expect, it } from 'vitest';
import { isDuplicateRecord, type DuplicateFields } from '../../../src/app/records/is-duplicate-record.ts';

function makeFields(overrides: Partial<DuplicateFields> = {}): DuplicateFields {
  return {
    category: 'fuel',
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
});
