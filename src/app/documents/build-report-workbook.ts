import ExcelJS from 'exceljs';
import { formatDateCell, formatNumberCell, formatWorkbookSheet, HEADER_ROW, type ColumnUnit } from './format-workbook-sheet.ts';
import { addExportMarks, type ExportMarks } from './add-export-marks.ts';
import { addNoteSheet, type NoteSheet } from './add-note-sheet.ts';
import { readColumnUnit } from './column-units.ts';

export type ReportColumn = { name: string; type: 'number' | 'text' | 'date'; unit?: ColumnUnit | null };

export type ReportCell = number | string | null;

export type ReportTable = { title: string; createdAt: Date; columns: ReportColumn[]; rows: ReportCell[][]; marks?: ExportMarks; extraSheets?: NoteSheet[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const REPORT_SHEET_NAME = 'Báo cáo';

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(REPORT_SHEET_NAME);
  sheet.getRow(HEADER_ROW).values = table.columns.map((column) => column.name);
  table.rows.forEach((cells, index) => writeReportRow(sheet.getRow(HEADER_ROW + 1 + index), table.columns, cells));
  formatWorkbookSheet(sheet, { title: table.title, createdAt: table.createdAt, lastDataRow: HEADER_ROW + table.rows.length, units: table.columns.map(readColumnUnit) });
  for (const noteSheet of table.extraSheets ?? []) addNoteSheet(workbook, noteSheet);
  if (table.marks !== undefined) addExportMarks(workbook, sheet, table.columns.length, table.marks);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
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
