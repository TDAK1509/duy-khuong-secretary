import type { ParsedSheet } from './parse-sheet.ts';

export function parseCsv(bytes: Uint8Array): ParsedSheet {
  const text = decodeUtf8(bytes);
  const rows = splitIntoCells(text);
  const nonEmpty = rows.filter(hasAnyNonEmptyCell);
  if (nonEmpty.length === 0) return { ok: true, headers: [], rows: [] };
  return { ok: true, headers: nonEmpty[0], rows: nonEmpty.slice(1) };
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function splitIntoCells(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => line.split(','));
}

function hasAnyNonEmptyCell(row: string[]): boolean {
  return row.some((cell) => cell !== '');
}
