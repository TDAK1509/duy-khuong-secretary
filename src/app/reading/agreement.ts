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

export function sortItemsForComparison(reading: Reading): ReadingItem[] {
  return reading.items.toSorted((first, second) => buildSortKey(first).localeCompare(buildSortKey(second)));
}

function listComparableItems(reading: Reading): ComparableItem[] {
  return sortItemsForComparison(reading).map(toComparableItem);
}

function toComparableItem(item: ReadingItem) {
  return {
    maintenance_item: toAccentFreeForm(item.maintenance_item),
    occurred_on: item.occurred_on,
    amount_vnd: item.amount_vnd,
    identifiers: normalizeCodeSet(item.identifiers),
    vehicle_plate: normalizeCode(item.vehicle_plate),
    document_number: normalizeCode(item.document_number),
  };
}

function buildSortKey(item: ReadingItem): string {
  const comparable = toComparableItem(item);
  return JSON.stringify([
    comparable.maintenance_item,
    comparable.occurred_on,
    comparable.amount_vnd,
    comparable.document_number,
    comparable.identifiers.join(','),
    toAccentFreeForm(item.category),
    toAccentFreeForm(item.document_title),
  ]);
}
