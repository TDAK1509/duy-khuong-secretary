import type ExcelJS from 'exceljs';
import { isAdditiveUnit, type ColumnUnit } from './column-units.ts';

export { COLUMN_UNITS, type ColumnUnit } from './column-units.ts';

export type SubtotalRow = { row: number; firstDataRow: number; lastDataRow: number; groupColumn: number; groupLabel: string; labelColumn: number | null };

export type SheetLayout = { title: string; createdAt: Date; lastDataRow: number; units: (ColumnUnit | null)[]; totalColumns?: number[] | null; subtotals?: SubtotalRow[] };

export const HEADER_ROW = 4;
export const FIRST_DATA_ROW = HEADER_ROW + 1;

const UNIT_FORMATS: Record<Exclude<ColumnUnit, 'rate' | 'number'>, string> = { vnd: '#,##0 "đ"', kg: '#,##0 "kg"', ton: '#,##0.00 "tấn"', liter: '#,##0.0 "lít"' };
const INTEGER_FORMAT = '#,##0';
const DECIMAL_FORMAT = '#,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';
const TOTAL_LABEL = 'Tổng cộng';
export const INFERRED_MARK = '(AI suy luận ra)';

export const HOUSE_COLORS = { darkBlue: 'FF1F3864', white: 'FFFFFFFF', bandFill: 'FFF2F5FA', rowLine: 'FFD0D7E2', totalFill: 'FFDCE6F2', subtotalFill: 'FFE8EEF7', infoGrey: 'FF595959', inferredAmber: 'FF7F6000' } as const;

const MIN_WIDTH = 8;
const MAX_WIDTH = 50;
const WIDTH_PADDING = 2;
const WIDE_CHARACTER = /\p{Extended_Pictographic}|\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
const QUOTED_SUFFIX = /"([^"]*)"$/;
const DECIMAL_PLACES = /\.(0+)/;

export function formatWorkbookSheet(sheet: ExcelJS.Worksheet, layout: SheetLayout): void {
  applyUnitFormats(sheet, layout);
  for (const subtotal of layout.subtotals ?? []) writeSubtotalRow(sheet, subtotal, layout);
  const lastRow = addTotalRow(sheet, layout);
  writeTitleBlock(sheet, layout);
  styleHeaderRow(sheet.getRow(HEADER_ROW), layout.units.length);
  styleBodyRows(sheet, layout);
  fitColumnWidths(sheet, layout.units.length, lastRow);
  sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: Math.max(HEADER_ROW, layout.lastDataRow), column: layout.units.length } };
  sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` };
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

function applyUnitFormats(sheet: ExcelJS.Worksheet, { units, lastDataRow }: SheetLayout): void {
  units.forEach((unit, index) => {
    if (unit === null || unit === 'rate') return;
    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= lastDataRow; rowNumber += 1) {
      const cell = sheet.getRow(rowNumber).getCell(index + 1);
      if (typeof cell.value === 'number') cell.numFmt = chooseUnitFormat(unit, cell.value);
    }
  });
}

function chooseUnitFormat(unit: ColumnUnit, value: number): string {
  if (unit === 'rate' || unit === 'number') return Number.isInteger(value) ? INTEGER_FORMAT : DECIMAL_FORMAT;
  return UNIT_FORMATS[unit];
}

function writeSubtotalRow(sheet: ExcelJS.Worksheet, subtotal: SubtotalRow, layout: SheetLayout): void {
  const row = sheet.getRow(subtotal.row);
  const groupCell = sheet.getRow(subtotal.firstDataRow).getCell(subtotal.groupColumn + 1);
  row.getCell(subtotal.groupColumn + 1).value = isBlankValue(groupCell.value) ? subtotal.groupLabel : groupCell.value;
  row.getCell(subtotal.groupColumn + 1).numFmt = groupCell.numFmt;
  if (subtotal.labelColumn !== null) row.getCell(subtotal.labelColumn + 1).value = `Tổng ${subtotal.groupLabel}`;
  for (const index of listTotalColumns(layout)) {
    const range = { column: index + 1, firstRow: subtotal.firstDataRow, lastRow: subtotal.lastDataRow };
    writeTotalCell(sheet, row.getCell(index + 1), { ...range, unit: layout.units[index]!, skipRows: new Set(), countsHiddenRows: true });
  }
  styleSummaryRow(row, layout.units.length, HOUSE_COLORS.subtotalFill);
  for (let rowNumber = subtotal.firstDataRow; rowNumber <= subtotal.lastDataRow; rowNumber += 1) sheet.getRow(rowNumber).outlineLevel = 1;
  sheet.properties.outlineLevelRow = 1;
}

function isBlankValue(value: ExcelJS.CellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function listTotalColumns({ units, totalColumns }: SheetLayout): number[] {
  return totalColumns ?? units.flatMap((unit, index) => (isAdditiveUnit(unit) ? [index] : []));
}

function addTotalRow(sheet: ExcelJS.Worksheet, layout: SheetLayout): number {
  const { units, lastDataRow } = layout;
  const totaled = listTotalColumns(layout);
  if (totaled.length === 0 || lastDataRow < FIRST_DATA_ROW) return lastDataRow;
  const row = sheet.getRow(lastDataRow + 1);
  const labelColumn = units.findIndex((_, index) => !totaled.includes(index));
  if (labelColumn >= 0) row.getCell(labelColumn + 1).value = TOTAL_LABEL;
  const skipRows = new Set((layout.subtotals ?? []).map((subtotal) => subtotal.row));
  const countsHiddenRows = skipRows.size > 0;
  for (const index of totaled) writeTotalCell(sheet, row.getCell(index + 1), { column: index + 1, firstRow: FIRST_DATA_ROW, lastRow: lastDataRow, unit: units[index]!, skipRows, countsHiddenRows });
  if (labelColumn < 0) labelTotalByFormat(row.getCell(totaled[0]! + 1));
  styleSummaryRow(row, units.length, HOUSE_COLORS.totalFill, true);
  return lastDataRow + 1;
}

function labelTotalByFormat(cell: ExcelJS.Cell): void {
  cell.numFmt = `"${TOTAL_LABEL}: "${cell.numFmt}`;
}

type TotalTarget = { column: number; firstRow: number; lastRow: number; unit: ColumnUnit; skipRows: Set<number>; countsHiddenRows: boolean };

const SUM_VISIBLE = 109;
const SUM_UNFILTERED = 9;

function writeTotalCell(sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, target: TotalTarget): void {
  const letter = sheet.getColumn(target.column).letter;
  const sumFunction = target.countsHiddenRows ? SUM_UNFILTERED : SUM_VISIBLE;
  cell.value = { formula: `SUBTOTAL(${sumFunction},${letter}${target.firstRow}:${letter}${target.lastRow})`, result: sumColumn(sheet, target) };
  cell.numFmt = chooseUnitFormat(target.unit, 0);
}

function sumColumn(sheet: ExcelJS.Worksheet, { column, firstRow, lastRow, skipRows }: TotalTarget): number {
  let sum = 0;
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const value = sheet.getRow(rowNumber).getCell(column).value;
    if (!skipRows.has(rowNumber) && typeof value === 'number') sum += value;
  }
  return sum;
}

function styleSummaryRow(row: ExcelJS.Row, columnCount: number, fill: string, isGrandTotal = false): void {
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.border = isGrandTotal
      ? { top: { style: 'thin', color: { argb: HOUSE_COLORS.darkBlue } }, bottom: { style: 'double', color: { argb: HOUSE_COLORS.darkBlue } } }
      : { bottom: { style: 'thin', color: { argb: HOUSE_COLORS.rowLine } } };
    if (typeof cell.value === 'object' && cell.value !== null) cell.alignment = { horizontal: 'right' };
  }
}

function writeTitleBlock(sheet: ExcelJS.Worksheet, { title, createdAt, lastDataRow, units, subtotals }: SheetLayout): void {
  const lastColumn = Math.max(1, units.length);
  const titleCell = sheet.getRow(1).getCell(1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 15, color: { argb: HOUSE_COLORS.darkBlue } };
  sheet.getRow(1).height = 24;
  const infoCell = sheet.getRow(2).getCell(1);
  infoCell.value = `Số dòng: ${Math.max(0, lastDataRow - HEADER_ROW - (subtotals?.length ?? 0))} · Tạo lúc: ${formatVietnamTime(createdAt)}`;
  infoCell.font = { italic: true, size: 10, color: { argb: HOUSE_COLORS.infoGrey } };
  if (lastColumn > 1) {
    sheet.mergeCells(1, 1, 1, lastColumn);
    sheet.mergeCells(2, 1, 2, lastColumn);
  }
}

function formatVietnamTime(moment: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(moment).map((part) => [part.type, part.value]));
  return `${parts['day']}/${parts['month']}/${parts['year']} ${parts['hour']}:${parts['minute']}`;
}

function styleHeaderRow(row: ExcelJS.Row, columnCount: number): void {
  row.height = 30;
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true, color: { argb: HOUSE_COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOUSE_COLORS.darkBlue } };
    cell.border = { top: { style: 'thin', color: { argb: HOUSE_COLORS.darkBlue } }, bottom: { style: 'thin', color: { argb: HOUSE_COLORS.darkBlue } } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
}

function styleBodyRows(sheet: ExcelJS.Worksheet, { lastDataRow, units, subtotals }: SheetLayout): void {
  const summaryRows = new Set((subtotals ?? []).map((subtotal) => subtotal.row));
  let dataIndex = 0;
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= lastDataRow; rowNumber += 1) {
    if (summaryRows.has(rowNumber)) continue;
    const isBanded = dataIndex % 2 === 1;
    dataIndex += 1;
    for (let column = 1; column <= units.length; column += 1) styleBodyCell(sheet.getRow(rowNumber).getCell(column), isBanded);
  }
}

function styleBodyCell(cell: ExcelJS.Cell, isBanded: boolean): void {
  cell.border = { bottom: { style: 'hair', color: { argb: HOUSE_COLORS.rowLine } } };
  if (isBanded) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOUSE_COLORS.bandFill } };
  cell.alignment = chooseBodyAlignment(cell.value);
  if (typeof cell.value === 'string' && cell.value.includes(INFERRED_MARK)) cell.font = { color: { argb: HOUSE_COLORS.inferredAmber } };
}

function chooseBodyAlignment(value: ExcelJS.CellValue): Partial<ExcelJS.Alignment> {
  if (value instanceof Date) return { horizontal: 'center', vertical: 'top' };
  if (typeof value === 'number') return { horizontal: 'right', vertical: 'top' };
  return { vertical: 'top', wrapText: true };
}

function fitColumnWidths(sheet: ExcelJS.Worksheet, columnCount: number, lastRow: number): void {
  const longest = new Array<number>(columnCount).fill(0);
  for (let rowNumber = HEADER_ROW; rowNumber <= lastRow; rowNumber += 1) {
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
  if (typeof value === 'object' && value !== null && 'result' in value && typeof value.result === 'number') return formatDisplayedNumber(value.result, cell.numFmt);
  return value === null || value === undefined ? '' : String(value);
}

function formatDisplayedDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function formatDisplayedNumber(value: number, numFmt: string | undefined): string {
  const digits = numFmt?.match(DECIMAL_PLACES)?.[1]?.length ?? 0;
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
