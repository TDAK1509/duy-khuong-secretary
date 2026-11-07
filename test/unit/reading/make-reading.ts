import type { ReadAttempt, Reading, ReadingItem } from '../../../src/app/reading/reading.ts';

type ReadingDetail = ReadingItem['details'][number];
type DetailInput = Pick<ReadingDetail, 'label' | 'value'> | ReadingDetail;
type ItemOverrides = Partial<Omit<ReadingItem, 'details'>> & { details?: DetailInput[] };

export function makeItem({ details = [], ...overrides }: ItemOverrides = {}): ReadingItem {
  return {
    category: 'đổ xăng dầu',
    document_title: null,
    maintenance_item: null,
    occurred_on: '2026-10-30',
    amount_vnd: 1250000,
    identifiers: [],
    vehicle_plate: null,
    document_number: null,
    ...overrides,
    details: details.map(fillNumberAndUnit),
  };
}

function fillNumberAndUnit(detail: DetailInput): ReadingDetail {
  return { number: null, unit: null, ...detail };
}

export function makeReading(items: ReadingItem[] = [makeItem()], overrides: Partial<Reading> = {}): Reading {
  return { has_work_data: true, needs_explanation: false, has_question: false, items, ...overrides };
}

export function succeed(reading: Reading): ReadAttempt {
  return { ok: true, reading };
}
