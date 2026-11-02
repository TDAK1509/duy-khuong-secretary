import { toAccentFreeForm } from './normalize.ts';
import type { ReadingItem } from './reading.ts';

export function buildDetailKey(detail: ReadingItem['details'][number]): string {
  return JSON.stringify([toAccentFreeForm(detail.label), toAccentFreeForm(detail.value)]);
}
