import ExcelJS from 'exceljs';
import { formatDateCell, formatNumberCell, formatWorkbookSheet } from './format-workbook-sheet.ts';

export type ReportColumn = { name: string; type: 'number' | 'text' | 'date' };

export type ReportCell = number | string | null;

export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportCell[][] };

const HEADER_ROW_NUMBER = 2;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');
  sheet.addRow([table.title]).font = { bold: true, size: 13 };
  sheet.addRow(table.columns.map((column) => column.name));
  for (const cells of table.rows) addReportRow(sheet, table.columns, cells);
  formatWorkbookSheet(sheet, { headerRow: HEADER_ROW_NUMBER, lastRow: HEADER_ROW_NUMBER + table.rows.length, columnCount: table.columns.length });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function addReportRow(sheet: ExcelJS.Worksheet, columns: ReportColumn[], cells: ReportCell[]): void {
  const row = sheet.addRow(cells.map((cell, index) => (columns[index]?.type === 'text' && typeof cell === 'number' ? String(cell) : cell)));
  cells.forEach((cell, index) => {
    const type = columns[index]?.type;
    if (typeof cell === 'number' && type === 'number') formatNumberCell(row.getCell(index + 1), cell);
    if (typeof cell === 'string' && type === 'date' && ISO_DATE.test(cell)) formatDateCell(row.getCell(index + 1), cell);
  });
}
