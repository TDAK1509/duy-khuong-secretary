import type ExcelJS from 'exceljs';
import { ROW_ID_HEADER } from '../documents/add-export-marks.ts';
import { HEADER_ROW, TOTAL_LABEL } from '../documents/format-workbook-sheet.ts';
import type { CellValue } from '../documents/recorded-export.ts';
import type { SavedExport } from './find-saved-export.ts';
import { readReturnedCell } from './read-returned-cell.ts';

export type ReturnedRows = Map<string, Record<string, CellValue>>;

export function readReturnedRows(workbook: ExcelJS.Workbook, saved: SavedExport): ReturnedRows | null {
  const sheet = workbook.getWorksheet(saved.sheetName);
  if (sheet === undefined || !hasSavedHeader(sheet, saved)) return null;
  const rows = collectRows(sheet, saved);
  return rows !== null && rows.size === saved.rows.length ? rows : null;
}

function collectRows(sheet: ExcelJS.Worksheet, saved: SavedExport): ReturnedRows | null {
  const savedIds = new Set(saved.rows.map((row) => row.id));
  const rows: ReturnedRows = new Map();
  for (let rowNumber = HEADER_ROW + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const rowId = String(row.getCell(saved.columns.length + 1).value ?? '');
    if (rowId === '' && isTotalOrBlankRow(row)) continue;
    if (!savedIds.has(rowId) || rows.has(rowId)) return null;
    rows.set(rowId, readRowCells(row, saved));
  }
  return rows;
}

function hasSavedHeader(sheet: ExcelJS.Worksheet, saved: SavedExport): boolean {
  const expected = [...saved.columns.map((column) => column.name), ROW_ID_HEADER];
  const found = (sheet.getRow(HEADER_ROW).values as ExcelJS.CellValue[]).slice(1);
  return found.length === expected.length && expected.every((name, index) => found[index] === name);
}

function isTotalOrBlankRow(row: ExcelJS.Row): boolean {
  const filled = (row.values as ExcelJS.CellValue[]).slice(1).filter((value) => value !== null && value !== undefined && value !== '');
  return filled.every((value) => value === TOTAL_LABEL || (typeof value === 'object' && value !== null && 'formula' in value));
}

function readRowCells(row: ExcelJS.Row, saved: SavedExport): Record<string, CellValue> {
  return Object.fromEntries(saved.columns.map((column, index) => [column.key, readReturnedCell(row.getCell(index + 1).value, column.value_type)]));
}
