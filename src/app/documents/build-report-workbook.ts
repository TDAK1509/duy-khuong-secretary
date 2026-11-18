import ExcelJS from 'exceljs';
import { formatDateCell, formatNumberCell, formatWorkbookSheet } from './format-workbook-sheet.ts';

export type ReportColumn = { name: string; type: 'number' | 'text' | 'date' };

export type ReportCell = number | string | null;

export type TextSheet = { name: string; rows: string[][] };

export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportCell[][]; extraSheets?: TextSheet[] };

const HEADER_ROW_NUMBER = 2;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_SHEET_WIDTH = 40;

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');
  sheet.addRow([table.title]).font = { bold: true, size: 13 };
  sheet.addRow(table.columns.map((column) => column.name));
  for (const cells of table.rows) addReportRow(sheet, table.columns, cells);
  formatWorkbookSheet(sheet, { headerRow: HEADER_ROW_NUMBER, lastRow: HEADER_ROW_NUMBER + table.rows.length, columnCount: table.columns.length });
  for (const textSheet of table.extraSheets ?? []) addTextSheet(workbook, textSheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function addReportRow(sheet: ExcelJS.Worksheet, columns: ReportColumn[], cells: ReportCell[]): void {
  const row = sheet.addRow(cells.map((cell, index) => (columns[index]?.type === 'text' && typeof cell === 'number' ? String(cell) : cell)));
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

function addTextSheet(workbook: ExcelJS.Workbook, { name, rows }: TextSheet): void {
  const sheet = workbook.addWorksheet(name);
  for (const cells of rows) sheet.addRow(cells).alignment = { wrapText: true, vertical: 'top' };
  const columnCount = Math.max(0, ...rows.map((cells) => cells.length));
  for (let column = 1; column <= columnCount; column += 1) sheet.getColumn(column).width = TEXT_SHEET_WIDTH;
}
