import { sortItemsForComparison } from './agreement.ts';
import { toAccentFreeForm } from './normalize.ts';
import type { Reading, ReadingItem } from './reading.ts';

export type SavedReading = {
  has_work_data: boolean;
  has_question: boolean;
  items: ReadingItem[];
};

export function saveAgreedReading(first: Reading, second: Reading): SavedReading {
  const secondItems = sortItemsForComparison(second);
  const items = sortItemsForComparison(first).map((item, index) => keepSharedDetails(item, secondItems[index]));
  return { has_work_data: first.has_work_data, has_question: first.has_question, items };
}

function keepSharedDetails(item: ReadingItem, other: ReadingItem | undefined): ReadingItem {
  const otherKeys = new Set(other?.details.map(buildDetailKey));
  return { ...item, details: item.details.filter((detail) => otherKeys.has(buildDetailKey(detail))) };
}

function buildDetailKey(detail: ReadingItem['details'][number]): string {
  return JSON.stringify([toAccentFreeForm(detail.label), toAccentFreeForm(detail.value)]);
}
