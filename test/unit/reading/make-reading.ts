import type { ReadAttempt, Reading, ReadingItem } from '../../../src/app/reading/reading.ts';

export function makeItem(overrides: Partial<ReadingItem> = {}): ReadingItem {
  return {
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
}

export function makeFuelItemX(overrides: Partial<ReadingItem> = {}): ReadingItem {
  return makeItem({ amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234', ...overrides });
}

export function makeReading(items: ReadingItem[] = [makeItem()], overrides: Partial<Reading> = {}): Reading {
  return { has_work_data: true, needs_explanation: false, has_question: false, items, ...overrides };
}

export function succeed(reading: Reading): ReadAttempt {
  return { ok: true, reading };
}
