import { describe, expect, it } from 'vitest';
import { validateReading } from '../../../src/app/reading/reading.ts';

function makeJson(details: unknown[]): unknown {
  const item = {
    category: 'phiếu cân',
    document_title: null,
    maintenance_item: null,
    occurred_on: null,
    amount_vnd: null,
    identifiers: [],
    vehicle_plate: null,
    document_number: null,
    document_kind: 'phiếu cân xe',
    stage: null,
    parties: [],
    details,
  };
  return { has_work_data: true, needs_explanation: false, has_question: false, items: [item] };
}

function makeDetail(overrides: Record<string, unknown>): Record<string, unknown> {
  return { label: 'Độ ẩm', value: '5%', number: null, unit: null, meaning: null, item: null, date_time: null, ...overrides };
}

describe('validateReading for documents', () => {
  it('keeps a percent unit for the document line and drops it for the record', () => {
    const attempt = validateReading(makeJson([makeDetail({ number: 5, unit: '%', meaning: 'Độ ẩm' })]));

    expect(attempt).toMatchObject({
      ok: true,
      reading: { items: [{ details: [{ number: null, unit: null, line_number: 5, line_unit: '%' }] }] },
    });
  });
});
