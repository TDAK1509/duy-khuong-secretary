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
  return { reading: saveAgreedReading(removeCodes(first.reading), removeCodes(second.reading)), codes };
}

function findExtraCode(item: ReadingItem, other: ReadingItem): string | undefined {
  const otherCodes = new Set(other.identifiers.map(normalizeCode));
  return item.identifiers.find((code) => !otherCodes.has(normalizeCode(code)));
}

function removeCodes(reading: Reading): Reading {
  return { ...reading, items: reading.items.map((item) => ({ ...item, identifiers: [] })) };
}
