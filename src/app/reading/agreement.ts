import { isDeepStrictEqual } from 'node:util';
import { normalizeCode, normalizeCodeSet, toAccentFreeForm } from './normalize.ts';
import type { ReadAttempt, Reading, ReadingItem } from './reading.ts';

type ComparableItem = ReturnType<typeof toComparableItem>;

export function areAgreeing(first: ReadAttempt, second: ReadAttempt): boolean {
  if (!first.ok || !second.ok) return false;
  return (
    first.reading.has_work_data === second.reading.has_work_data &&
    first.reading.has_question === second.reading.has_question &&
    isDeepStrictEqual(listComparableItems(first.reading), listComparableItems(second.reading))
  );
}

function listComparableItems(reading: Reading): ComparableItem[] {
  return reading.items.map(toComparableItem).toSorted(compareBySortKey);
}

function toComparableItem(item: ReadingItem) {
  return {
    category: item.category,
    maintenance_item: toAccentFreeForm(item.maintenance_item),
    occurred_on: item.occurred_on,
    amount_vnd: item.amount_vnd,
    identifiers: normalizeCodeSet(item.identifiers),
    vehicle_plate: normalizeCode(item.vehicle_plate),
    document_number: normalizeCode(item.document_number),
  };
}

function compareBySortKey(first: ComparableItem, second: ComparableItem): number {
  return buildSortKey(first).localeCompare(buildSortKey(second));
}

function buildSortKey(item: ComparableItem): string {
  return JSON.stringify([
    item.category,
    item.maintenance_item,
    item.occurred_on,
    item.amount_vnd,
    item.document_number,
    item.identifiers.join(','),
  ]);
}
