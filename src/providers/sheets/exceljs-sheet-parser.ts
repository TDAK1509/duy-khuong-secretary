import ExcelJS from 'exceljs';
import type { SheetParser, SheetRow, XlsxRows } from '../../services/sheets/sheet-parser.ts';

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const DATE_TOKENS = /[dy]|m{3,}/i;
const TIME_TOKENS = /h|s|\[m+\]/i;

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

function readRows(sheet: ExcelJS.Worksheet): SheetRow[] {
  const rows: SheetRow[] = [];
  const width = sheet.actualColumnCount;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column++) cells.push(readCellValue(row.getCell(column)));
    if (cells.some((cell) => cell !== '')) rows.push({ rowNumber, cells });
  });
  return rows;
}

function readCellValue(cell: ExcelJS.Cell): string {
  return describeValue(cell.value, cell.numFmt ?? '');
}

function describeValue(value: ExcelJS.CellValue, numFmt: string): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return describeDate(value, numFmt);
  if (typeof value === 'number') return describeNumber(value, numFmt);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return describeObject(value, numFmt);
}

function describeObject(value: object, numFmt: string): string {
  if ('result' in value) return describeValue(value.result as ExcelJS.CellValue, numFmt);
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part: { text: string }) => part.text).join('').trim();
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  return '';
}

function describeDate(value: Date, numFmt: string): string {
  if (isTimeOnlyFormat(numFmt)) return formatDuration((value.getTime() - EXCEL_EPOCH_MS) / 60_000);
  return value.toISOString().slice(0, 10);
}

function describeNumber(value: number, numFmt: string): string {
  if (isTimeOnlyFormat(numFmt)) return formatDuration(value * 24 * 60);
  if (DATE_TOKENS.test(stripLiterals(numFmt))) return new Date(EXCEL_EPOCH_MS + Math.round(value) * DAY_MS).toISOString().slice(0, 10);
  return String(value);
}

function isTimeOnlyFormat(numFmt: string): boolean {
  const format = stripLiterals(numFmt);
  return TIME_TOKENS.test(format) && !DATE_TOKENS.test(format.replace(/\[[hms]+\]/gi, ''));
}

function stripLiterals(numFmt: string): string {
  return numFmt.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
}

function formatDuration(totalMinutes: number): string {
  const minutes = Math.round(totalMinutes);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
