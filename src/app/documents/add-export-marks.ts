import type ExcelJS from 'exceljs';
import { HEADER_ROW } from './format-workbook-sheet.ts';

export const ROW_ID_HEADER = '_row_id';
export const MARK_SHEET_NAME = '_tro_ly';
export const MARK_FORMAT = 1;

export type ExportMarks = { exportId: string; rowIds: string[] };

export function addExportMarks(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, columnCount: number, marks: ExportMarks): void {
  const idColumn = columnCount + 1;
  sheet.getRow(HEADER_ROW).getCell(idColumn).value = ROW_ID_HEADER;
  marks.rowIds.forEach((id, index) => {
    sheet.getRow(HEADER_ROW + 1 + index).getCell(idColumn).value = id;
  });
  sheet.getColumn(idColumn).hidden = true;
  addMarkSheet(workbook, sheet.name, marks.exportId);
}

function addMarkSheet(workbook: ExcelJS.Workbook, sheetName: string, exportId: string): void {
  const markSheet = workbook.addWorksheet(MARK_SHEET_NAME, { state: 'veryHidden' });
  markSheet.addRow(['format', 'export_id', 'sheet']);
  markSheet.addRow([MARK_FORMAT, exportId, sheetName]);
}
