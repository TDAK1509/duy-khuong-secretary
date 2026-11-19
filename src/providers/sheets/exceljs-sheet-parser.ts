import ExcelJS from 'exceljs';
import type { SheetParser, SheetRow, XlsxRows } from '../../services/sheets/sheet-parser.ts';

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const DATE_TOKENS = /[dy]|m{3,}/i;
const TIME_TOKENS = /h|s|\[m+\]/i;
const MINUTE_ROUNDING_SLACK = 1e-6;
const ELAPSED_TOKENS = /\[[hms]+\]/i;
const EXCEL_1904_EPOCH_MS = Date.UTC(1904, 0, 1);

export class ExcelJsSheetParser implements SheetParser {
  async parseXlsx(bytes: Uint8Array): Promise<XlsxRows> {
    try {
      const workbook = await loadWorkbook(bytes);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { ok: true, rows: [] };
      return { ok: true, rows: readRows(sheet, { epochMs: workbook.properties.date1904 ? EXCEL_1904_EPOCH_MS : EXCEL_EPOCH_MS }) };
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

type CellContext = { epochMs: number };

function readRows(sheet: ExcelJS.Worksheet, context: CellContext): SheetRow[] {
  const rows: SheetRow[] = [];
  const width = sheet.actualColumnCount;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column++) cells.push(readCellValue(row.getCell(column), context));
    if (cells.some((cell) => cell !== '')) rows.push({ rowNumber, cells });
  });
  return rows;
}

function readCellValue(cell: ExcelJS.Cell, context: CellContext): string {
  return describeValue(cell.value, cell.numFmt ?? '', context);
}

function describeValue(value: ExcelJS.CellValue, numFmt: string, context: CellContext): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return describeDate(value, numFmt, context);
  if (typeof value === 'number') return describeNumber(value, numFmt, context);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return describeObject(value, numFmt, context);
}

function describeObject(value: object, numFmt: string, context: CellContext): string {
  if ('result' in value) return describeValue(value.result as ExcelJS.CellValue, numFmt, context);
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part: { text: string }) => part.text).join('').trim();
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('text' in value && typeof value.text === 'object' && value.text !== null) return describeObject(value.text, numFmt, context);
  return '';
}

function describeDate(value: Date, numFmt: string, context: CellContext): string {
  const format = stripLiterals(numFmt);
  if (!DATE_TOKENS.test(format) && !TIME_TOKENS.test(format)) return describeNumber((value.getTime() - context.epochMs) / DAY_MS, numFmt, context);
  if (isTimeOnlyFormat(numFmt)) return describeTime((value.getTime() - context.epochMs) / DAY_MS, format);
  return value.toISOString().slice(0, 10);
}

function describeNumber(value: number, numFmt: string, context: CellContext): string {
  if (isTimeOnlyFormat(numFmt)) return describeTime(value, stripLiterals(numFmt));
  if (DATE_TOKENS.test(stripLiterals(numFmt))) return new Date(context.epochMs + Math.round(value) * DAY_MS).toISOString().slice(0, 10);
  return formatPlainDecimal(value);
}

function describeTime(days: number, format: string): string {
  const isElapsed = ELAPSED_TOKENS.test(format);
  return formatDuration((isElapsed ? days : days - Math.floor(days)) * 24 * 60);
}

function formatPlainDecimal(value: number): string {
  return Number(value.toPrecision(15)).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 15 });
}

function isTimeOnlyFormat(numFmt: string): boolean {
  const format = stripLiterals(numFmt);
  return TIME_TOKENS.test(format) && !DATE_TOKENS.test(format.replace(/\[[hms]+\]/gi, ''));
}

function stripLiterals(numFmt: string): string {
  return numFmt.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
}

function formatDuration(totalMinutes: number): string {
  const minutes = Math.floor(totalMinutes + MINUTE_ROUNDING_SLACK);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
