import { areAgreeing } from './agreement.ts';
import type { ReadingDecision } from './decide-reading.ts';
import { normalizeCode } from './normalize.ts';
import type { Reading, ReadingItem } from './reading.ts';
import { saveAgreedReading, type SavedReading } from './save-agreed-reading.ts';

export type CodeSplit = { reading: SavedReading; codes: string[] };

export function findCodeSplit(decision: ReadingDecision): CodeSplit | null {
  const [first, second] = decision.strong ?? [];
  if (!first?.ok || !second?.ok) return null;
  return splitCodes(first.reading, second.reading);
}

function splitCodes(first: Reading, second: Reading): CodeSplit | null {
  const firstItem = findOnlyItem(first);
  const secondItem = findOnlyItem(second);
  if (firstItem === null || secondItem === null) return null;
  const firstShared = keepSharedCodes(first, secondItem);
  const secondShared = keepSharedCodes(second, firstItem);
  if (!areAgreeing({ ok: true, reading: firstShared }, { ok: true, reading: secondShared })) return null;
  const firstExtras = listExtraCodes(firstItem, secondItem);
  const secondExtras = listExtraCodes(secondItem, firstItem);
  if (firstExtras.length > 1 || secondExtras.length > 1) return null;
  return { reading: saveAgreedReading(firstShared, secondShared), codes: [...firstExtras, ...secondExtras] };
}

function findOnlyItem({ items }: Reading): ReadingItem | null {
  const [item] = items;
  return item !== undefined && items.length === 1 ? item : null;
}

function listExtraCodes(item: ReadingItem, other: ReadingItem): string[] {
  const extras = item.identifiers.filter((code) => !hasCode(other, code));
  return extras.filter((code, index) => extras.findIndex((same) => normalizeCode(same) === normalizeCode(code)) === index);
}

function keepSharedCodes(reading: Reading, other: ReadingItem): Reading {
  return { ...reading, items: reading.items.map((item) => ({ ...item, identifiers: item.identifiers.filter((code) => hasCode(other, code)) })) };
}

function hasCode(item: ReadingItem, code: string): boolean {
  return item.identifiers.some((own) => normalizeCode(own) === normalizeCode(code));
}
