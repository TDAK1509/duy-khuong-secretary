import { z } from 'zod';
import type { ReportCell, ReportColumn } from './build-report-workbook.ts';

export type SortKey = { column: number; direction: 'asc' | 'desc' };

export type ReportLayout = { sort: SortKey[] };

export type LayoutChoice = { kind: 'chosen' | 'default'; layout: ReportLayout } | { kind: 'invalid'; reason: string; layout: ReportLayout };

export const layoutArgumentSchema = z
  .object({ sort: z.array(z.object({ column: z.number(), direction: z.enum(['asc', 'desc']) })).nullable().optional() })
  .nullable()
  .optional();

const MAX_SORT_KEYS = 3;
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

export function readReportLayout(raw: z.infer<typeof layoutArgumentSchema>, columns: ReportColumn[]): LayoutChoice {
  const fallback = { sort: listDefaultSort(columns) };
  const sort = raw?.sort ?? [];
  if (sort.length === 0) return { kind: 'default', layout: fallback };
  const reason = findSortProblem(sort, columns);
  logLayout(reason === null ? `sort=${sort.map((key) => `${key.column}:${key.direction}`).join(',')}` : `invalid reason=${reason} fallback`);
  return reason === null ? { kind: 'chosen', layout: { sort } } : { kind: 'invalid', reason, layout: fallback };
}

function listDefaultSort(columns: ReportColumn[]): SortKey[] {
  const dateColumn = columns.findIndex((column) => column.type === 'date');
  return dateColumn < 0 ? [] : [{ column: dateColumn, direction: 'asc' }];
}

function findSortProblem(sort: SortKey[], columns: ReportColumn[]): string | null {
  if (sort.length > MAX_SORT_KEYS) return 'too_many_sort_keys';
  if (sort.some((key) => !Number.isInteger(key.column) || key.column < 0 || key.column >= columns.length)) return 'sort_column_missing';
  return null;
}

function logLayout(line: string): void {
  console.log(`[report-layout] ${line}`);
}

export function describeEffectiveLayout(choice: LayoutChoice, columns: ReportColumn[]): Record<string, unknown> {
  return {
    sort_source: choice.kind,
    ...(choice.kind === 'invalid' ? { fallback_reason: choice.reason } : {}),
    sort: choice.layout.sort.map((key) => ({ column: columns[key.column]?.name ?? String(key.column), direction: key.direction })),
  };
}

export function sortReportRows<Row>(rows: Row[], { sort }: ReportLayout, readCells: (row: Row) => ReportCell[]): Row[] {
  if (sort.length === 0) return rows;
  return rows
    .map((row, position) => ({ row, position }))
    .sort((first, second) => compareByKeys(readCells(first.row), readCells(second.row), sort) || first.position - second.position)
    .map((entry) => entry.row);
}

function compareByKeys(first: ReportCell[], second: ReportCell[], keys: SortKey[]): number {
  for (const { column, direction } of keys) {
    const order = compareCells(readSortValue(first[column]), readSortValue(second[column]), direction);
    if (order !== 0) return order;
  }
  return 0;
}

function readSortValue(cell: ReportCell | undefined): number | string | null {
  if (cell === undefined || cell === null) return null;
  if (typeof cell === 'number') return cell;
  const text = cell.trim();
  return text === '' ? null : text;
}

function compareCells(first: number | string | null, second: number | string | null, direction: SortKey['direction']): number {
  if (first === null || second === null) return Number(first === null) - Number(second === null);
  const order = compareValues(first, second);
  return direction === 'asc' ? order : -order;
}

function compareValues(first: number | string, second: number | string): number {
  if (typeof first === 'number' && typeof second === 'number') return first - second;
  if (typeof first === 'number') return -1;
  if (typeof second === 'number') return 1;
  return collator.compare(first, second) || (first < second ? -1 : first > second ? 1 : 0);
}
