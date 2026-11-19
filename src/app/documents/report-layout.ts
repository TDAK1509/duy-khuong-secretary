import { z } from 'zod';
import type { ReportCell, ReportColumn } from './build-report-workbook.ts';
import { isAdditiveUnit, readColumnUnit } from './column-units.ts';

export type SortKey = { column: number; direction: 'asc' | 'desc' };

export type ReportLayout = { sort: SortKey[]; groupBy: number | null; totals: number[] | null };

export type LayoutChoice = { kind: 'none' } | { kind: 'valid'; layout: ReportLayout } | { kind: 'invalid'; reason: string };

export type RowGroup = { value: ReportCell; label: string; rows: ReportCell[][] };

export const layoutArgumentSchema = z
  .object({
    sort: z.array(z.object({ column: z.number(), direction: z.enum(['asc', 'desc']) })),
    group_by: z.number().nullable(),
    totals: z.array(z.number()).nullable(),
  })
  .nullable()
  .optional();

export const EMPTY_GROUP_LABEL = '(Trống)';

const MAX_SORT_KEYS = 3;
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

export function readReportLayout(raw: z.infer<typeof layoutArgumentSchema>, columns: ReportColumn[]): LayoutChoice {
  if (raw === null || raw === undefined) return { kind: 'none' };
  const layout = { sort: raw.sort, groupBy: raw.group_by, totals: raw.totals };
  const reason = findLayoutProblem(layout, columns);
  logLayout(reason === null ? describeValidLayout(layout) : `invalid reason=${reason} fallback`);
  return reason === null ? { kind: 'valid', layout } : { kind: 'invalid', reason };
}

function findLayoutProblem({ sort, groupBy, totals }: ReportLayout, columns: ReportColumn[]): string | null {
  const exists = (index: number) => Number.isInteger(index) && index >= 0 && index < columns.length;
  if (sort.length > MAX_SORT_KEYS) return 'too_many_sort_keys';
  if (sort.some((key) => !exists(key.column))) return 'sort_column_missing';
  if (groupBy !== null && !exists(groupBy)) return 'group_column_missing';
  if (groupBy !== null && isAdditiveUnit(readColumnUnit(columns[groupBy]!))) return 'group_column_additive';
  if (totals !== null && totals.some((index) => !exists(index))) return 'total_column_missing';
  if (totals !== null && totals.some((index) => !isAdditiveUnit(readColumnUnit(columns[index]!)))) return 'total_column_not_additive';
  return null;
}

function describeValidLayout({ sort, groupBy, totals }: ReportLayout): string {
  const keys = sort.map((key) => `${key.column}:${key.direction}`).join(',') || '-';
  return `group=${groupBy ?? '-'} sort=${keys} totals=${totals === null ? 'auto' : totals.join(',') || '-'}`;
}

function logLayout(line: string): void {
  console.log(`[report-layout] ${line}`);
}

export function sortReportRows(rows: ReportCell[][], { sort, groupBy }: ReportLayout): ReportCell[][] {
  const keys: SortKey[] = [...(groupBy === null ? [] : [{ column: groupBy, direction: 'asc' as const }]), ...sort];
  return rows
    .map((cells, position) => ({ cells, position }))
    .sort((first, second) => compareByKeys(first.cells, second.cells, keys) || first.position - second.position)
    .map((entry) => entry.cells);
}

function compareByKeys(first: ReportCell[], second: ReportCell[], keys: SortKey[]): number {
  for (const { column, direction } of keys) {
    const order = compareCells(first[column] ?? null, second[column] ?? null, direction);
    if (order !== 0) return order;
  }
  return 0;
}

function compareCells(first: ReportCell, second: ReportCell, direction: SortKey['direction']): number {
  const firstBlank = isBlank(first);
  const secondBlank = isBlank(second);
  if (firstBlank || secondBlank) return Number(firstBlank) - Number(secondBlank);
  const order = compareValues(first!, second!);
  return direction === 'asc' ? order : -order;
}

function compareValues(first: number | string, second: number | string): number {
  if (typeof first === 'number' && typeof second === 'number') return first - second;
  if (typeof first === 'number') return -1;
  if (typeof second === 'number') return 1;
  return collator.compare(first, second) || (first < second ? -1 : first > second ? 1 : 0);
}

export function isBlank(cell: ReportCell): boolean {
  return cell === null || (typeof cell === 'string' && cell.trim() === '');
}

export function groupSortedRows(rows: ReportCell[][], groupBy: number, describeValue: (cell: ReportCell) => string): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const cells of rows) {
    const value = isBlank(cells[groupBy] ?? null) ? null : (cells[groupBy] ?? null);
    const last = groups.at(-1);
    if (last !== undefined && last.value === value) last.rows.push(cells);
    else groups.push({ value, label: value === null ? EMPTY_GROUP_LABEL : describeValue(value), rows: [cells] });
  }
  return groups;
}

export function describeEffectiveLayout(choice: LayoutChoice, columns: ReportColumn[]): Record<string, unknown> {
  const layout = choice.kind === 'valid' ? choice.layout : { sort: [], groupBy: null, totals: null };
  const name = (index: number) => columns[index]?.name ?? String(index);
  const totals = layout.totals ?? columns.flatMap((column, index) => (isAdditiveUnit(readColumnUnit(column)) ? [index] : []));
  return {
    applied: choice.kind === 'valid',
    ...(choice.kind === 'invalid' ? { fallback_reason: choice.reason } : {}),
    group_by: layout.groupBy === null ? null : name(layout.groupBy),
    sort: layout.sort.map((key) => ({ column: name(key.column), direction: key.direction })),
    totals: totals.map(name),
  };
}
