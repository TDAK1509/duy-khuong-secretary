import ExcelJS from 'exceljs';

export async function readSheetColumn(bytes: Uint8Array, header: string): Promise<string[] | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const rows = listRows(workbook.worksheets[0]);
  const headerRow = rows.findIndex((row) => row.includes(header));
  if (headerRow < 0) return null;
  const column = rows[headerRow]!.indexOf(header);
  const dataRows = rows.slice(headerRow + 1);
  const totalRow = dataRows.findIndex((row) => row.includes('Tổng cộng'));
  return (totalRow < 0 ? dataRows : dataRows.slice(0, totalRow)).map((row) => row[column] ?? '');
}

function listRows(sheet: ExcelJS.Worksheet | undefined): string[][] {
  const rows: string[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row) => rows.push(listCells(row)));
  return rows;
}

function listCells(row: ExcelJS.Row): string[] {
  const cells: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cells[columnNumber - 1] = cell.value === null || cell.value === undefined ? '' : String(cell.value);
  });
  return cells;
}
