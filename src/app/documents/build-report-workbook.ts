import ExcelJS from 'exceljs';

export type ReportColumn = { name: string; type: 'number' | 'text' };

export type ReportCell = number | string | null;

export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportCell[][] };

const INTEGER_FORMAT = '#,##0';
const DECIMAL_FORMAT = '#,##0.00';
const HEADER_ROW_NUMBER = 2;

export async function buildReportWorkbook(table: ReportTable): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Báo cáo');
  sheet.addRow([table.title]).font = { bold: true, size: 13 };
  sheet.addRow(table.columns.map((column) => column.name)).font = { bold: true };
  for (const cells of table.rows) addReportRow(sheet, table.columns, cells);
  sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW_NUMBER }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function addReportRow(sheet: ExcelJS.Worksheet, columns: ReportColumn[], cells: ReportCell[]): void {
  const row = sheet.addRow(cells.map((cell, index) => (columns[index]?.type === 'text' && typeof cell === 'number' ? String(cell) : cell)));
  cells.forEach((cell, index) => {
    if (typeof cell === 'number' && columns[index]?.type === 'number') row.getCell(index + 1).numFmt = Number.isInteger(cell) ? INTEGER_FORMAT : DECIMAL_FORMAT;
  });
}
