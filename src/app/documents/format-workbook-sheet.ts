import type ExcelJS from 'exceljs';

export type SheetLayout = { headerRow: number; lastRow: number; columnCount: number };

export const INTEGER_FORMAT = '#,##0';
export const DECIMAL_FORMAT = '#,##0.00';
export const DATE_FORMAT = 'dd/mm/yyyy';

const MIN_WIDTH = 8;
const MAX_WIDTH = 50;
const WIDTH_PADDING = 2;
const HEADER_FILL = 'FFD9D9D9';
const WIDE_CHARACTER = /\p{Extended_Pictographic}|\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
const QUOTED_SUFFIX = /"([^"]*)"$/;

export function formatWorkbookSheet(sheet: ExcelJS.Worksheet, layout: SheetLayout): void {
  styleCells(sheet, layout);
  styleHeaderRow(sheet.getRow(layout.headerRow), layout.columnCount);
  fitColumnWidths(sheet, layout);
  sheet.views = [{ state: 'frozen', ySplit: layout.headerRow }];
  sheet.autoFilter = { from: { row: layout.headerRow, column: 1 }, to: { row: layout.lastRow, column: layout.columnCount } };
}

export function formatNumberCell(cell: ExcelJS.Cell, value: number, unit: string | null = null): void {
  cell.value = value;
  const base = Number.isInteger(value) ? INTEGER_FORMAT : DECIMAL_FORMAT;
  cell.numFmt = unit === null ? base : `${base}"${unit.replaceAll('"', '')}"`;
}

export function formatDateCell(cell: ExcelJS.Cell, isoDate: string): void {
  const [year, month, day] = isoDate.split('-').map(Number);
  cell.value = new Date(Date.UTC(year!, month! - 1, day!));
  cell.numFmt = DATE_FORMAT;
}

function styleCells(sheet: ExcelJS.Worksheet, { headerRow, lastRow }: SheetLayout): void {
  for (let rowNumber = headerRow; rowNumber <= lastRow; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell((cell) => {
      if (typeof cell.value === 'string') cell.alignment = { ...cell.alignment, wrapText: true };
      if (typeof cell.value === 'number') cell.alignment = { ...cell.alignment, horizontal: 'right' };
    });
  }
}

function styleHeaderRow(row: ExcelJS.Row, columnCount: number): void {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }
}

function fitColumnWidths(sheet: ExcelJS.Worksheet, { headerRow, lastRow, columnCount }: SheetLayout): void {
  const longest = new Array<number>(columnCount).fill(0);
  for (let rowNumber = headerRow; rowNumber <= lastRow; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell((cell, column) => {
      if (column <= columnCount) longest[column - 1] = Math.max(longest[column - 1]!, measureLongestLine(describeDisplayedText(cell)));
    });
  }
  longest.forEach((length, index) => {
    sheet.getColumn(index + 1).width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, length + WIDTH_PADDING));
  });
}

function describeDisplayedText(cell: ExcelJS.Cell): string {
  const { value } = cell;
  if (value instanceof Date) return formatDisplayedDate(value);
  if (typeof value === 'number') return formatDisplayedNumber(value, cell.numFmt);
  return value === null || value === undefined ? '' : String(value);
}

function formatDisplayedDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function formatDisplayedNumber(value: number, numFmt: string | undefined): string {
  const digits = numFmt?.startsWith(DECIMAL_FORMAT) ? 2 : 0;
  const number = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return number + (numFmt?.match(QUOTED_SUFFIX)?.[1] ?? '');
}

function measureLongestLine(text: string): number {
  return Math.max(0, ...text.split(/\r?\n/).map(measureLine));
}

function measureLine(line: string): number {
  let length = 0;
  for (const character of line) length += WIDE_CHARACTER.test(character) ? 2 : 1;
  return length;
}
