import { toAccentFreeForm } from './normalize.ts';
import type { ReadingItem } from './reading.ts';

export function buildDetailKey(detail: Pick<ReadingItem['details'][number], 'label' | 'value'>): string {
  return JSON.stringify([toAccentFreeForm(detail.label), toAccentFreeForm(detail.value)]);
}
