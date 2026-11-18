import ExcelJS from 'exceljs';
import type { DocumentFactValue } from '../facts/document-fact-values.ts';
import { formatDateCell, formatNumberCell, formatWorkbookSheet } from './format-workbook-sheet.ts';

export type ExportRow = {
  document_date: string | null;
  kind: string;
  title: string | null;
  document_number: string | null;
  vehicle_plate: string | null;
  amount_vnd: number | null;
  sender_name: string | null;
  fact_values: DocumentFactValue[];
};

type FactColumn = { key: string; name: string };

const HEADER_LABELS = ['Ngày', 'Loại', 'Tiêu đề', 'Số chứng từ', 'Biển số', 'Số tiền (VND)', 'Người gửi'] as const;
const DATE_COLUMN = 1;
const AMOUNT_COLUMN = 6;

export async function buildDocumentsWorkbook(rows: ExportRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giấy tờ');
  const factColumns = collectFactColumns(rows);
  sheet.addRow([...HEADER_LABELS, ...factColumns.map((column) => column.name)]);
  for (const row of rows) addDataRow(sheet, row, factColumns);
  formatWorkbookSheet(sheet, { headerRow: 1, lastRow: 1 + rows.length, columnCount: HEADER_LABELS.length + factColumns.length });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function collectFactColumns(rows: ExportRow[]): FactColumn[] {
  const columns = new Map<string, FactColumn>();
  for (const value of rows.flatMap((row) => row.fact_values)) {
    if (!columns.has(value.key)) columns.set(value.key, { key: value.key, name: value.name });
  }
  return [...columns.values()];
}

function addDataRow(sheet: ExcelJS.Worksheet, data: ExportRow, factColumns: FactColumn[]): void {
  const row = sheet.addRow([null, data.kind, data.title, data.document_number, data.vehicle_plate, null, data.sender_name]);
  if (data.document_date !== null) formatDateCell(row.getCell(DATE_COLUMN), data.document_date);
  if (data.amount_vnd !== null) formatNumberCell(row.getCell(AMOUNT_COLUMN), Math.round(data.amount_vnd));
  factColumns.forEach((column, index) => writeFactCell(row.getCell(HEADER_LABELS.length + index + 1), data.fact_values, column.key));
}

function writeFactCell(cell: ExcelJS.Cell, values: DocumentFactValue[], key: string): void {
  const value = values.find((candidate) => candidate.key === key);
  if (value === undefined) return;
  const number = Number(value.number);
  if (value.number !== null && value.unit !== null && Number.isFinite(number)) return formatNumberCell(cell, number, value.unit);
  cell.value = value.text;
}
