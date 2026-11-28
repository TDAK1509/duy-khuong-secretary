import ExcelJS from 'exceljs';
import { z } from 'zod';
import { MARK_FORMAT, MARK_SHEET_NAME } from '../documents/add-export-marks.ts';

export type ReturnedWorkbook = { workbook: ExcelJS.Workbook; exportId: string };

const MARK_ROW = 2;
const FORMAT_COLUMN = 1;
const EXPORT_ID_COLUMN = 2;

export async function readReturnedWorkbook(bytes: Uint8Array): Promise<ReturnedWorkbook | null> {
  const workbook = await loadWorkbook(bytes);
  const exportId = workbook === null ? null : readMarkedExportId(workbook);
  return workbook === null || exportId === null ? null : { workbook, exportId };
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook | null> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return workbook;
  } catch {
    return null;
  }
}

function readMarkedExportId(workbook: ExcelJS.Workbook): string | null {
  const row = workbook.getWorksheet(MARK_SHEET_NAME)?.getRow(MARK_ROW);
  if (row === undefined || row.getCell(FORMAT_COLUMN).value !== MARK_FORMAT) return null;
  const exportId = z.uuid().safeParse(row.getCell(EXPORT_ID_COLUMN).value);
  return exportId.success ? exportId.data : null;
}
