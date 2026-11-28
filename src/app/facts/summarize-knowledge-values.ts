import type { DocumentKnowledgeRow } from './knowledge-totals.ts';
import { PER_TON_UNIT } from './knowledge-outcomes.ts';

export type AmountGroup = { group: string | null; unit: string; documents: number; sum: number; values: { number: string; documents: number }[] };

export type RateLine = { rate: string; documents: number; documents_without_weight: number; tons: number; amount: number };

export type PerTonGroup = { group: string | null; unit: string; documents: number; rates: RateLine[]; amount: number };

export type KnowledgeSummary = { amounts: AmountGroup[]; per_ton: PerTonGroup[] };

export function summarizeKnowledgeValues(rows: DocumentKnowledgeRow[]): KnowledgeSummary {
  return {
    amounts: groupRows(rows.filter((row) => row.unit !== PER_TON_UNIT), (row) => `${row.unit}`).map(summarizeAmounts),
    per_ton: groupRows(rows.filter((row) => row.unit === PER_TON_UNIT), () => PER_TON_UNIT).map(summarizePerTon),
  };
}

function groupRows(rows: DocumentKnowledgeRow[], pickKind: (row: DocumentKnowledgeRow) => string): DocumentKnowledgeRow[][] {
  const groups = new Map<string, DocumentKnowledgeRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.group, pickKind(row)]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

function summarizeAmounts(rows: DocumentKnowledgeRow[]): AmountGroup {
  const counts = countBy(rows, (row) => row.number ?? '');
  return {
    group: rows[0]?.group ?? null,
    unit: rows[0]?.unit ?? '',
    documents: rows.length,
    sum: rows.reduce((total, row) => total + Number(row.number), 0),
    values: [...counts].map(([number, documents]) => ({ number, documents })),
  };
}

function summarizePerTon(rows: DocumentKnowledgeRow[]): PerTonGroup {
  const byRate = groupRows(rows, (row) => row.number ?? '').map(summarizeRate);
  return { group: rows[0]?.group ?? null, unit: PER_TON_UNIT, documents: rows.length, rates: byRate, amount: byRate.reduce((total, line) => total + line.amount, 0) };
}

function summarizeRate(rows: DocumentKnowledgeRow[]): RateLine {
  const rate = rows[0]?.number ?? '0';
  const weighed = rows.filter((row) => row.weight_kg !== null);
  const tons = weighed.reduce((total, row) => total + Number(row.weight_kg), 0) / 1000;
  return { rate, documents: rows.length, documents_without_weight: rows.length - weighed.length, tons, amount: Math.round(Number(rate) * tons) };
}

function countBy(rows: DocumentKnowledgeRow[], pickKey: (row: DocumentKnowledgeRow) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(pickKey(row), (counts.get(pickKey(row)) ?? 0) + 1);
  return counts;
}
