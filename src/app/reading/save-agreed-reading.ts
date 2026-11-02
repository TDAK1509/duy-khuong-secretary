import { sortItemsForComparison } from './agreement.ts';
import { toAccentFreeForm } from './normalize.ts';
import type { Reading, ReadingItem } from './reading.ts';

export type SavedReading = {
  has_work_data: boolean;
  has_question: boolean;
  items: ReadingItem[];
};

export function saveAgreedReading(first: Reading, second: Reading): SavedReading {
  const partnerOf = pairItemsForComparison(first, second);
  const items = first.items.map((item) => keepSharedDetails(item, partnerOf.get(item)));
  return { has_work_data: first.has_work_data, has_question: first.has_question, items };
}

function pairItemsForComparison(first: Reading, second: Reading): Map<ReadingItem, ReadingItem | undefined> {
  const secondItems = sortItemsForComparison(second);
  return new Map(sortItemsForComparison(first).map((item, index) => [item, secondItems[index]]));
}

function keepSharedDetails(item: ReadingItem, other: ReadingItem | undefined): ReadingItem {
  const otherKeys = new Set(other?.details.map(buildDetailKey));
  return { ...item, details: item.details.filter((detail) => otherKeys.has(buildDetailKey(detail))) };
}

function buildDetailKey(detail: ReadingItem['details'][number]): string {
  return JSON.stringify([toAccentFreeForm(detail.label), toAccentFreeForm(detail.value)]);
}
