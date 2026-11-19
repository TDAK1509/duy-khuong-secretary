import ExcelJS from 'exceljs';
import { FIRST_DATA_ROW, formatDateCell, formatNumberCell, formatWorkbookSheet, HEADER_ROW, type ColumnUnit } from './format-workbook-sheet.ts';
import { addNoteSheet, type NoteSheet } from './add-note-sheet.ts';

export type ReportColumn = { name: string; type: 'number' | 'text' | 'date'; unit?: ColumnUnit | null };

export type ReportCell = number | string | null;

export type ReportTable = { title: string; createdAt: Date; columns: ReportColumn[]; rows: ReportCell[][]; extraSheets?: NoteSheet[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');
  sheet.getRow(HEADER_ROW).values = table.columns.map((column) => column.name);
  table.rows.forEach((cells, index) => writeReportRow(sheet.getRow(FIRST_DATA_ROW + index), table.columns, cells));
  formatWorkbookSheet(sheet, { title: table.title, createdAt: table.createdAt, lastDataRow: HEADER_ROW + table.rows.length, units: table.columns.map(readColumnUnit) });
  for (const noteSheet of table.extraSheets ?? []) addNoteSheet(workbook, noteSheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function readColumnUnit(column: ReportColumn): ColumnUnit | null {
  if (column.type !== 'number') return null;
  return column.unit === undefined ? 'number' : column.unit;
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
