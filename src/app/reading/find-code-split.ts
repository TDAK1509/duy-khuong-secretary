import type { ReadingDecision } from './decide-reading.ts';
import { normalizeCode } from './normalize.ts';
import type { Reading, ReadingItem } from './reading.ts';
import { saveAgreedReading, type SavedReading } from './save-agreed-reading.ts';

export type CodeSplit = { reading: SavedReading; codes: string[] };

export function findCodeSplit(decision: ReadingDecision): CodeSplit | null {
  const [first, second] = decision.strong ?? [];
  if (!first?.ok || !second?.ok) return null;
  const [firstItem] = first.reading.items;
  const [secondItem] = second.reading.items;
  if (!firstItem || !secondItem) return null;
  const codes = [findExtraCode(firstItem, secondItem), findExtraCode(secondItem, firstItem)].filter((code) => code !== undefined);
  const reading = saveAgreedReading(keepSharedCodes(first.reading, secondItem), keepSharedCodes(second.reading, firstItem));
  return { reading, codes };
}

function findExtraCode(item: ReadingItem, other: ReadingItem): string | undefined {
  return item.identifiers.find((code) => !hasCode(other, code));
}

function keepSharedCodes(reading: Reading, other: ReadingItem): Reading {
  return { ...reading, items: reading.items.map((item) => ({ ...item, identifiers: item.identifiers.filter((code) => hasCode(other, code)) })) };
}

function hasCode(item: ReadingItem, code: string): boolean {
  return item.identifiers.some((own) => normalizeCode(own) === normalizeCode(code));
}
