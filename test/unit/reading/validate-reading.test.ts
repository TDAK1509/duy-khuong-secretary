import { describe, expect, it } from 'vitest';
import { validateReading } from '../../../src/app/reading/reading.ts';

function makeFuelJson(overrides: Record<string, unknown> = {}): unknown {
  const item = {
    category: 'đổ xăng dầu',
    document_title: null,
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
      reading: { items: [{ category: 'đổ xăng dầu', amount_vnd: 1250000, occurred_on: '2026-10-30' }] },
    });
  });

  it('keeps a category outside the old list and the printed title', () => {
    const title = 'Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới';

    const attempt = validateReading(makeFuelJson({ category: 'kiểm định xe', document_title: title }));

    expect(attempt).toMatchObject({ ok: true, reading: { items: [{ category: 'kiểm định xe', document_title: title }] } });
  });

  it('fails the read when a date does not exist', () => {
    const attempt = validateReading(makeFuelJson({ occurred_on: '2026-02-30' }));

    expect(attempt).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('fails the read when an amount is negative', () => {
    const attempt = validateReading(makeFuelJson({ amount_vnd: -5 }));

    expect(attempt).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('fails the read when the reading has an extra property', () => {
    const json = { ...(makeFuelJson() as object), confidence: 0.9 };

    expect(validateReading(json)).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('fails the read when an item has an extra property', () => {
    const json = makeFuelJson({ currency: 'VND' });

    expect(validateReading(json)).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('fails the read when a detail has an extra property', () => {
    const json = makeFuelJson({ details: [{ label: 'Số lít', value: '50', unit: 'l' }] });

    expect(validateReading(json)).toEqual({ ok: false, reason: 'invalid_output' });
  });
});
