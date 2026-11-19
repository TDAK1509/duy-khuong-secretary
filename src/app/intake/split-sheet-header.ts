import type { SheetRow } from '../../services/sheets/sheet-parser.ts';

export type SplitSheet = { headers: string[]; headerRowNumber: number; contextLines: string[]; rows: SheetRow[] };

const SCAN_ROWS = 10;
const CORROBORATING_ROWS = 3;
const MIN_HEADER_CELLS = 2;

export function splitSheetHeader(rows: SheetRow[]): SplitSheet | null {
  const [first] = rows;
  if (first === undefined) return null;
  const headerIndex = findHeaderIndex(rows);
  const header = rows[headerIndex] ?? first;
  return {
    headers: header.cells,
    headerRowNumber: header.rowNumber,
    contextLines: rows.slice(0, headerIndex).map(describeContextLine).filter((line) => line !== ''),
    rows: rows.slice(headerIndex + 1),
  };
}

function findHeaderIndex(rows: SheetRow[]): number {
  let best = { index: 0, score: 0 };
  rows.slice(0, SCAN_ROWS).forEach((row, index) => {
    const score = scoreHeaderRow(row, rows.slice(index + 1, index + 1 + CORROBORATING_ROWS));
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

function scoreHeaderRow(row: SheetRow, following: SheetRow[]): number {
  const filled = row.cells.flatMap((cell, column) => (cell === '' ? [] : [column]));
  const distinct = new Set(row.cells.filter((cell) => cell !== '')).size;
  if (distinct < MIN_HEADER_CELLS) return 0;
  const corroboration = following.filter((next) => filled.filter((column) => (next.cells[column] ?? '') !== '').length * 2 >= filled.length).length;
  return distinct + corroboration;
}

function describeContextLine(row: SheetRow): string {
  return [...new Set(row.cells.filter((cell) => cell !== ''))].join(' · ');
}
