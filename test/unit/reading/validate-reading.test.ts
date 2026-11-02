import { describe, expect, it } from 'vitest';
import { validateReading } from '../../../src/app/reading/reading.ts';

function makeFuelJson(overrides: Record<string, unknown> = {}): unknown {
  const item = {
    category: 'fuel',
    maintenance_item: null,
    occurred_on: '2026-10-30',
    amount_vnd: 1250000,
    identifiers: [],
    vehicle_plate: null,
    document_number: null,
    details: [],
    ...overrides,
  };
  return { has_work_data: true, has_question: false, items: [item] };
}

describe('validateReading', () => {
  it('turns JSON that matches the schema into a reading', () => {
    const attempt = validateReading(makeFuelJson());

    expect(attempt).toMatchObject({
      ok: true,
      reading: { items: [{ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30' }] },
    });
  });
});
