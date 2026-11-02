import { isDeepStrictEqual } from 'node:util';
import type { ReadAttempt, ReadingItem } from './reading.ts';

export function areAgreeing(first: ReadAttempt, second: ReadAttempt): boolean {
  if (!first.ok || !second.ok) return false;
  return (
    first.reading.has_work_data === second.reading.has_work_data &&
    first.reading.has_question === second.reading.has_question &&
    isDeepStrictEqual(first.reading.items.map(toComparableItem), second.reading.items.map(toComparableItem))
  );
}

function toComparableItem(item: ReadingItem): unknown {
  return {
    category: item.category,
    maintenance_item: item.maintenance_item,
    occurred_on: item.occurred_on,
    amount_vnd: item.amount_vnd,
    identifiers: item.identifiers,
    vehicle_plate: item.vehicle_plate,
    document_number: item.document_number,
  };
}
