import { z } from 'zod';
import type { ReportCell, ReportColumn } from './build-report-workbook.ts';
import { isAdditiveUnit, readColumnUnit, type ColumnUnit } from './column-units.ts';
import type { IntroLine } from './format-workbook-sheet.ts';

export type SummaryItem = { label: string; measure: 'sum' | 'count' | 'count_distinct'; column: number | null };

export type SummaryFigure = { label: string; value: number; unit: ColumnUnit | null; blankRows: number };

export const summaryArgumentSchema = z.array(z.object({ label: z.string(), measure: z.enum(['sum', 'count', 'count_distinct']), column: z.number().nullable() })).nullable().optional();

const MAX_FIGURES = 4;
const MAX_LABEL_LENGTH = 40;
const MAX_SUBTITLE_LENGTH = 120;
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const UNIT_SUFFIXES: Partial<Record<ColumnUnit, { suffix: string; digits: number }>> = {
  vnd: { suffix: ' đ', digits: 0 },
  kg: { suffix: ' kg', digits: 0 },
  ton: { suffix: ' tấn', digits: 2 },
  liter: { suffix: ' lít', digits: 1 },
};

export function listIntroLines(subtitle: string | null, figures: SummaryFigure[]): IntroLine[] {
  return [...(subtitle === null ? [] : [{ text: subtitle, style: 'subtitle' as const }]), ...figures.map((figure) => ({ text: describeFigure(figure), style: 'figure' as const }))];
}

export function describeFigure({ label, value, unit, blankRows }: SummaryFigure): string {
  const format = unit === null ? undefined : UNIT_SUFFIXES[unit];
  const digits = format?.digits ?? 0;
  const number = value.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${label}: ${number}${format?.suffix ?? ''}${blankRows > 0 ? ` (${blankRows} dòng trống)` : ''}`;
}

export type ReportIntro = { subtitle: string | null; figures: SummaryFigure[] };

export type IntroRequest = { summary?: z.infer<typeof summaryArgumentSchema>; subtitle?: string | null } | null | undefined;

export function readReportIntro(raw: IntroRequest, isLayoutValid: boolean, table: { columns: ReportColumn[]; rows: ReportCell[][] }): ReportIntro {
  if (!isLayoutValid || raw === null || raw === undefined) return { subtitle: null, figures: [] };
  return { subtitle: cleanSubtitle(raw.subtitle), figures: computeSummaryFigures(readSummary(raw.summary, table.columns), table.rows, table.columns) };
}

function readSummary(raw: z.infer<typeof summaryArgumentSchema>, columns: ReportColumn[]): SummaryItem[] | null {
  if (raw === null || raw === undefined || raw.length === 0) return null;
  const items = raw.map((item) => ({ ...item, label: item.label.trim() }));
  const reason = findSummaryProblem(items, columns);
  if (reason === null) return items;
  console.log(`[report-layout] summary invalid reason=${reason} dropped`);
  return null;
}

function findSummaryProblem(items: SummaryItem[], columns: ReportColumn[]): string | null {
  if (items.length > MAX_FIGURES) return 'too_many_figures';
  if (items.some((item) => item.label === '' || item.label.length > MAX_LABEL_LENGTH)) return 'label_length';
  for (const { measure, column } of items) {
    if (measure === 'count') continue;
    if (column === null || !Number.isInteger(column) || column < 0 || column >= columns.length) return `${measure}_column_missing`;
    if (measure === 'sum' && !isAdditiveUnit(readColumnUnit(columns[column]!))) return 'sum_column_not_additive';
  }
  return null;
}

function computeSummaryFigures(items: SummaryItem[] | null, rows: ReportCell[][], columns: ReportColumn[]): SummaryFigure[] {
  return (items ?? []).map((item) => computeFigure(item, rows, columns));
}

function computeFigure({ label, measure, column }: SummaryItem, rows: ReportCell[][], columns: ReportColumn[]): SummaryFigure {
  if (measure === 'count' || column === null) return { label, value: rows.length, unit: null, blankRows: 0 };
  const cells = rows.map((cells) => cells[column] ?? null);
  const present = cells.filter((cell) => cell !== null && !(typeof cell === 'string' && cell.trim() === ''));
  if (measure === 'count_distinct') return { label, value: new Set(present.map((cell) => (typeof cell === 'string' ? cell.trim() : cell))).size, unit: null, blankRows: 0 };
  const sum = present.reduce<number>((total, cell) => total + (typeof cell === 'number' ? cell : 0), 0);
  return { label, value: sum, unit: readColumnUnit(columns[column]!), blankRows: cells.length - present.length };
}

function cleanSubtitle(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SUBTITLE_LENGTH);
  return text === '' ? null : text;
}

export function describeIntro({ subtitle, figures }: ReportIntro): Record<string, unknown> {
  return { subtitle, summary: figures.map((figure) => ({ label: figure.label, value: figure.value, unit: figure.unit, blank_rows: figure.blankRows, text: describeFigure(figure) })) };
}
