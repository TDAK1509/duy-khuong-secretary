import { readLinePair, readNumberPair, type LinePair, type NumberPair, type ReadAttempt, type Reading, type ReadingItem } from '../../../src/app/reading/reading.ts';

type ReadingDetail = ReadingItem['details'][number];
type DetailInput = Pick<ReadingDetail, 'label' | 'value'> & Partial<NumberPair> & Partial<Pick<ReadingDetail, 'meaning' | 'item' | 'date_time'>>;
export type ItemOverrides = Partial<Omit<ReadingItem, 'details'>> & { details?: DetailInput[] };

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
    document_kind: '',
    stage: null,
    parties: [],
    ...overrides,
    details: details.map(fillDetail),
  };
}

function fillDetail({ number = null, unit = null, ...detail }: DetailInput): ReadingDetail {
  const filled = { meaning: null, item: null, date_time: null, ...detail, ...readNumberPair(number, unit) };
  return hideLinePairFromReaderJson(filled, readLinePair(number, unit));
}

function hideLinePairFromReaderJson<Detail extends object>(detail: Detail, linePair: LinePair): Detail & LinePair {
  return Object.defineProperties(detail, {
    line_number: { value: linePair.line_number, enumerable: false },
    line_unit: { value: linePair.line_unit, enumerable: false },
  }) as Detail & LinePair;
}

export function makeReading(items: ReadingItem[] = [makeItem()], overrides: Partial<Reading> = {}): Reading {
  return { has_work_data: true, needs_explanation: false, has_question: false, photo_problem: null, items, ...overrides };
}

export function succeed(reading: Reading): ReadAttempt {
  return { ok: true, reading };
}
