import ExcelJS from 'exceljs';
import type { SheetParser, XlsxRows } from '../../services/sheets/sheet-parser.ts';

export class ExcelJsSheetParser implements SheetParser {
  async parseXlsx(bytes: Uint8Array): Promise<XlsxRows> {
    try {
      const workbook = await loadWorkbook(bytes);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { ok: true, rows: [] };
      return { ok: true, rows: readRows(sheet) };
    } catch {
      return { ok: false };
    }
  }
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return workbook;
}

function readRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  const width = sheet.actualColumnCount;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(readRowCells(row, width));
  });
  return rows;
}

function readRowCells(row: ExcelJS.Row, width: number): string[] {
  const cells: string[] = [];
  for (let column = 1; column <= width; column++) cells.push(readCellText(row.getCell(column)));
  return cells;
}

function readCellText(cell: ExcelJS.Cell): string {
  const text = cell.text;
  return typeof text === 'string' ? text : '';
}
