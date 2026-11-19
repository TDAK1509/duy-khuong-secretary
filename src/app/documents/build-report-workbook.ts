import ExcelJS from 'exceljs';
import { findHeaderRow, formatDateCell, formatNumberCell, formatWorkbookSheet, type ColumnUnit, type SubtotalRow } from './format-workbook-sheet.ts';
import { listIntroLines, type SummaryFigure } from './report-summary.ts';
import { groupSortedRows, sortReportRows, type ReportLayout, type RowGroup } from './report-layout.ts';
import { addNoteSheet, type NoteSheet } from './add-note-sheet.ts';
import { readColumnUnit } from './column-units.ts';

export type ReportColumn = { name: string; type: 'number' | 'text' | 'date'; unit?: ColumnUnit | null };

export type ReportCell = number | string | null;

export type ReportTable = { title: string; createdAt: Date; columns: ReportColumn[]; rows: ReportCell[][]; layout?: ReportLayout | null; subtitle?: string | null; figures?: SummaryFigure[]; extraSheets?: NoteSheet[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');
  const introLines = listIntroLines(table.subtitle ?? null, table.figures ?? []);
  const headerRow = findHeaderRow(introLines);
  sheet.getRow(headerRow).values = table.columns.map((column) => column.name);
  const body = writeBody(sheet, table, headerRow);
  formatWorkbookSheet(sheet, { title: table.title, createdAt: table.createdAt, headerRow, introLines, units: table.columns.map(readColumnUnit), ...body, totalColumns: table.layout?.totals ?? null });
  for (const noteSheet of table.extraSheets ?? []) addNoteSheet(workbook, noteSheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

type WrittenBody = { lastDataRow: number; subtotals: SubtotalRow[] };

function writeBody(sheet: ExcelJS.Worksheet, { columns, rows, layout }: ReportTable, headerRow: number): WrittenBody {
  const ordered = layout ? sortReportRows(rows, layout) : rows;
  const groupBy = layout?.groupBy ?? null;
  const groupColumn = groupBy === null ? undefined : columns[groupBy];
  if (groupBy === null || groupColumn === undefined) {
    ordered.forEach((cells, index) => writeReportRow(sheet.getRow(headerRow + 1 + index), columns, cells));
    return { lastDataRow: headerRow + ordered.length, subtotals: [] };
  }
  const groups = groupSortedRows(ordered, groupBy, (cell) => describeGroupValue(cell, groupColumn));
  return writeGroups(sheet, { columns, groups, groupColumn: groupBy, firstRow: headerRow + 1 });
}

type GroupedBody = { columns: ReportColumn[]; groups: RowGroup[]; groupColumn: number; firstRow: number };

function writeGroups(sheet: ExcelJS.Worksheet, { columns, groups, groupColumn, firstRow }: GroupedBody): WrittenBody {
  const labelColumn = columns.findIndex((column, index) => column.type === 'text' && index !== groupColumn);
  const subtotals: SubtotalRow[] = [];
  let rowNumber = firstRow;
  for (const group of groups) {
    const firstDataRow = rowNumber;
    for (const cells of group.rows) writeReportRow(sheet.getRow(rowNumber++), columns, cells);
    subtotals.push({ row: rowNumber, firstDataRow, lastDataRow: rowNumber - 1, groupColumn, groupLabel: group.label, labelColumn: labelColumn < 0 ? null : labelColumn });
    rowNumber += 1;
  }
  return { lastDataRow: rowNumber - 1, subtotals };
}

function describeGroupValue(cell: ReportCell, column: ReportColumn): string {
  if (typeof cell === 'number') return cell.toLocaleString('vi-VN');
  if (column.type === 'date' && typeof cell === 'string' && isCalendarDate(cell)) return cell.split('-').reverse().join('/');
  return String(cell);
}

function writeReportRow(row: ExcelJS.Row, columns: ReportColumn[], cells: ReportCell[]): void {
  row.values = cells.map((cell, index) => (columns[index]?.type === 'text' && typeof cell === 'number' ? String(cell) : cell));
  cells.forEach((cell, index) => {
    const type = columns[index]?.type;
    if (typeof cell === 'number' && type === 'number') formatNumberCell(row.getCell(index + 1), cell);
    if (typeof cell === 'string' && type === 'date' && isCalendarDate(cell)) formatDateCell(row.getCell(index + 1), cell);
  });
}

function isCalendarDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  return new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
}
