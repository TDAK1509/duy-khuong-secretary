import ExcelJS from 'exceljs';
import { insertEntry, insertPaper, linkEntry } from './paper-fixtures.ts';
import type { LeakDatabases } from './leak-databases.ts';
import { FIRST_DATA_ROW, findColumn, HEADER_ROW } from './returned-export-files.ts';
import { loadWorkbook } from './read-marked-sheet.ts';
import { createToolHarness } from './tool-harness.ts';

const PAPER_FILTERS = { organization: null, role: null, stage: null, kind: null, plate: '51C12345', date_meaning: null, date_from: '2026-03-01', date_to: '2026-03-31' };

export const WAGE_HEADER = 'Lương tài xế';

export type AlphaExportOptions = { count?: number; customer?: string };

export async function exportAlphaPapers(databases: LeakDatabases, { count = 1, customer }: AlphaExportOptions = {}): Promise<Uint8Array> {
  for (let day = 0; day < count; day += 1) await insertPaper(databases.owner, { stage: 'dispatch', plate: '51C12345', date: `2026-03-0${5 + day}`, parties: [{ role: 'issuer', name: 'Alpha' }] });
  await linkEntry(databases.runtime, await insertEntry(databases.owner, { pickup: 'Alpha', wageVnd: 600000, customer }));
  const harness = createToolHarness(databases.runtime);
  await harness.runTool('chat-gate', 'export_documents_xlsx', PAPER_FILTERS);
  return harness.storage.listStoredFiles()[0]!.bytes;
}

export async function pointMarkAtExport(bytes: Uint8Array, exportId: string): Promise<Uint8Array> {
  const workbook = await loadWorkbook(bytes);
  workbook.getWorksheet('_tro_ly')!.getRow(2).getCell(2).value = exportId;
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}

export function swapCustomerAndWageColumns(sheet: ExcelJS.Worksheet): void {
  const [customer, wage] = [findColumn(sheet, 'Khách hàng'), findColumn(sheet, WAGE_HEADER)];
  for (let rowNumber = HEADER_ROW; rowNumber <= FIRST_DATA_ROW; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const customerValue = row.getCell(customer).value;
    row.getCell(customer).value = row.getCell(wage).value;
    row.getCell(wage).value = customerValue;
  }
}

export function reverseThreeDataRows(sheet: ExcelJS.Worksheet): void {
  const rows = [0, 1, 2].map((offset) => (sheet.getRow(FIRST_DATA_ROW + offset).values as ExcelJS.CellValue[]).slice(1));
  rows.reverse().forEach((values, offset) => {
    values.forEach((value, column) => {
      sheet.getRow(FIRST_DATA_ROW + offset).getCell(column + 1).value = value;
    });
  });
}
