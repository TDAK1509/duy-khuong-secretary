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
  return { has_work_data: true, needs_explanation: false, has_question: false, items: [item] };
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
    const json = makeFuelJson({ details: [{ label: 'Số lít', value: '50', number: 50, unit: 'l', currency: 'VND' }] });

    expect(validateReading(json)).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('keeps a valid number and unit of a detail', () => {
    const json = makeFuelJson({
      details: [{ label: 'Trọng lượng hàng', value: '27,420 Kg', number: 27420, unit: 'kg' }],
    });

    expect(validateReading(json)).toMatchObject({
      ok: true,
      reading: { items: [{ details: [{ label: 'Trọng lượng hàng', value: '27,420 Kg', number: 27420, unit: 'kg' }] }] },
    });
  });

  it('keeps zero as a valid number', () => {
    const json = makeFuelJson({ details: [{ label: 'Số lít', value: '0 l', number: 0, unit: 'l' }] });

    expect(validateReading(json)).toMatchObject({
      ok: true,
      reading: { items: [{ details: [{ label: 'Số lít', value: '0 l', number: 0, unit: 'l' }] }] },
    });
  });

  it('drops the number and unit of a detail with an unknown unit and keeps the reading', () => {
    const json = makeFuelJson({ details: [{ label: 'Trọng lượng hàng', value: '27,41 tấn', number: 27.41, unit: 'tấn' }] });

    expect(validateReading(json)).toMatchObject({
      ok: true,
      reading: { items: [{ details: [{ label: 'Trọng lượng hàng', value: '27,41 tấn', number: null, unit: null }] }] },
    });
  });
});
