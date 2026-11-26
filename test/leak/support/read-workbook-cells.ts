import ExcelJS from 'exceljs';

export async function readWorkbookCells(bytes: Uint8Array): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const cells: string[] = [];
  workbook.eachSheet((sheet) => {
    cells.push(sheet.name);
    sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.text))));
  });
  return cells;
}
