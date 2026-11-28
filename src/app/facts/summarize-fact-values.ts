import { PER_TON_UNIT, type DocumentFactValueRow } from './fact-value-totals.ts';

export type AmountGroup = { group: string | null; unit: string; documents: number; sum: number; values: { number: string; documents: number }[] };

export type RateLine = { rate: string; documents: number; documents_without_weight: number; tons: number; amount: number };

export type PerTonGroup = { group: string | null; unit: string; documents: number; rates: RateLine[]; amount: number };

export type TextGroup = { group: string | null; documents: number; values: { text: string; documents: number }[] };

export type FactValueSummary = { amounts: AmountGroup[]; per_ton: PerTonGroup[]; texts: TextGroup[] };

export function summarizeFactValues(rows: DocumentFactValueRow[]): FactValueSummary {
  const numberRows = rows.filter((row) => row.number !== null && row.unit !== null);
  return {
    amounts: groupRows(numberRows.filter((row) => row.unit !== PER_TON_UNIT), (row) => `${row.unit}`).map(summarizeAmounts),
    per_ton: groupRows(numberRows.filter((row) => row.unit === PER_TON_UNIT), () => PER_TON_UNIT).map(summarizePerTon),
    texts: groupRows(rows.filter((row) => row.text !== null), () => 'text').map(summarizeTexts),
  };
}

function groupRows(rows: DocumentFactValueRow[], pickKind: (row: DocumentFactValueRow) => string): DocumentFactValueRow[][] {
  const groups = new Map<string, DocumentFactValueRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.group, pickKind(row)]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

function summarizeAmounts(rows: DocumentFactValueRow[]): AmountGroup {
  const counts = countBy(rows, (row) => row.number ?? '');
  return {
    group: rows[0]?.group ?? null,
    unit: rows[0]?.unit ?? '',
    documents: rows.length,
    sum: rows.reduce((total, row) => total + Number(row.number), 0),
    values: [...counts].map(([number, documents]) => ({ number, documents })),
  };
}

function summarizePerTon(rows: DocumentFactValueRow[]): PerTonGroup {
  const byRate = groupRows(rows, (row) => row.number ?? '').map(summarizeRate);
  return { group: rows[0]?.group ?? null, unit: PER_TON_UNIT, documents: rows.length, rates: byRate, amount: byRate.reduce((total, line) => total + line.amount, 0) };
}

function summarizeRate(rows: DocumentFactValueRow[]): RateLine {
  const rate = rows[0]?.number ?? '0';
  const weighed = rows.filter((row) => row.weight_kg !== null);
  const tons = weighed.reduce((total, row) => total + Number(row.weight_kg), 0) / 1000;
  return { rate, documents: rows.length, documents_without_weight: rows.length - weighed.length, tons, amount: Math.round(Number(rate) * tons) };
}

function summarizeTexts(rows: DocumentFactValueRow[]): TextGroup {
  const counts = countBy(rows, (row) => row.text ?? '');
  return { group: rows[0]?.group ?? null, documents: rows.length, values: [...counts].map(([text, documents]) => ({ text, documents })) };
}

function countBy(rows: DocumentFactValueRow[], pickKey: (row: DocumentFactValueRow) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(pickKey(row), (counts.get(pickKey(row)) ?? 0) + 1);
  return counts;
}
