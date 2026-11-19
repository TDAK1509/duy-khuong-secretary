import type ExcelJS from 'exceljs';
import { HOUSE_COLORS } from './format-workbook-sheet.ts';

export type NoteBlock = { kind: 'label'; label: string; value: string } | { kind: 'blank' } | { kind: 'table'; header: string[]; rows: string[][] };

export type NoteSheet = { name: string; blocks: NoteBlock[] };

const LABEL_WIDTH = 55;
const VALUE_WIDTH = 30;

export function addNoteSheet(workbook: ExcelJS.Workbook, { name, blocks }: NoteSheet): void {
  const sheet = workbook.addWorksheet(name);
  for (const block of blocks) writeBlock(sheet, block);
  const columnCount = Math.max(2, ...blocks.map((block) => (block.kind === 'table' ? block.header.length : 2)));
  sheet.getColumn(1).width = LABEL_WIDTH;
  for (let column = 2; column <= columnCount; column += 1) sheet.getColumn(column).width = VALUE_WIDTH;
}

function writeBlock(sheet: ExcelJS.Worksheet, block: NoteBlock): void {
  if (block.kind === 'blank') sheet.addRow([]);
  if (block.kind === 'label') writeLabelRow(sheet.addRow([block.label, block.value]));
  if (block.kind === 'table') writeTable(sheet, block.header, block.rows);
}

function writeLabelRow(row: ExcelJS.Row): void {
  row.getCell(1).font = { bold: true };
  row.alignment = { vertical: 'top', wrapText: true };
}

function writeTable(sheet: ExcelJS.Worksheet, header: string[], rows: string[][]): void {
  const headerRow = sheet.addRow(header);
  header.forEach((_, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.font = { bold: true, color: { argb: HOUSE_COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOUSE_COLORS.darkBlue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  rows.forEach((cells, rowIndex) => {
    const row = sheet.addRow(cells);
    header.forEach((_, index) => {
      const cell = row.getCell(index + 1);
      cell.border = { bottom: { style: 'hair', color: { argb: HOUSE_COLORS.rowLine } } };
      cell.alignment = { vertical: 'top', wrapText: true };
      if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOUSE_COLORS.bandFill } };
    });
  });
}
