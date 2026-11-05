import { isDeepStrictEqual } from 'node:util';
import { normalizeCode, normalizeCodeSet, toAccentFreeForm } from './normalize.ts';
import type { ReadAttempt, Reading, ReadingItem } from './reading.ts';

export function areAgreeing(first: ReadAttempt, second: ReadAttempt): boolean {
  if (!first.ok || !second.ok) return false;
  return (
    first.reading.has_work_data === second.reading.has_work_data &&
    first.reading.has_question === second.reading.has_question &&
    haveAgreeingItems(first.reading, second.reading)
  );
}

function haveAgreeingItems(first: Reading, second: Reading): boolean {
  const firstItems = sortItemsForComparison(first);
  const secondItems = sortItemsForComparison(second);
  return (
    firstItems.length === secondItems.length &&
    firstItems.every((item, index) => isAgreeingPair(item, secondItems[index], firstItems))
  );
}

function isAgreeingPair(item: ReadingItem, partner: ReadingItem | undefined, readingItems: ReadingItem[]): boolean {
  if (partner === undefined || !isDeepStrictEqual(toComparableItem(item), toComparableItem(partner))) return false;
  return isUniqueByFixedFields(item, readingItems) || haveSameNaming(item, partner);
}

function isUniqueByFixedFields(item: ReadingItem, readingItems: ReadingItem[]): boolean {
  const fixedFields = JSON.stringify(toComparableItem(item));
  return readingItems.filter((other) => JSON.stringify(toComparableItem(other)) === fixedFields).length === 1;
}

function haveSameNaming(item: ReadingItem, partner: ReadingItem): boolean {
  return (
    toAccentFreeForm(item.category) === toAccentFreeForm(partner.category) &&
    toAccentFreeForm(item.document_title) === toAccentFreeForm(partner.document_title)
  );
}

export function sortItemsForComparison(reading: Reading): ReadingItem[] {
  return reading.items.toSorted((first, second) => buildSortKey(first).localeCompare(buildSortKey(second)));
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
    comparable.vehicle_plate,
    toAccentFreeForm(item.category),
    toAccentFreeForm(item.document_title),
  ]);
}
