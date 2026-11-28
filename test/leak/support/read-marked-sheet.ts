import ExcelJS from 'exceljs';

export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return workbook;
}

export type DataRow = { number: number; cells: string[] };

export async function listDataRows(bytes: Uint8Array, rowIdHeader: string): Promise<{ headers: string[]; rows: DataRow[] }> {
  const sheet = (await loadWorkbook(bytes)).worksheets[0]!;
  const headerRow = findHeaderRow(sheet, rowIdHeader);
  const headers = readCells(sheet.getRow(headerRow));
  const rows: DataRow[] = [];
  for (let number = headerRow + 1; number <= sheet.rowCount; number += 1) rows.push({ number, cells: readCells(sheet.getRow(number)) });
  return { headers, rows };
}

function findHeaderRow(sheet: ExcelJS.Worksheet, header: string): number {
  for (let number = 1; number <= sheet.rowCount; number += 1) if (readCells(sheet.getRow(number)).includes(header)) return number;
  throw new Error(`The sheet has no header "${header}"`);
}

function readCells(row: ExcelJS.Row): string[] {
  const cells: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cells[columnNumber - 1] = cell.value === null || cell.value === undefined ? '' : String(cell.value);
  });
  return cells;
}
