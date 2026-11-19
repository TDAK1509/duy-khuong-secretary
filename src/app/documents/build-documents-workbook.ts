import ExcelJS from 'exceljs';
import type { DocumentFactValue } from '../facts/document-fact-values.ts';
import { chooseValueUnit } from './choose-value-unit.ts';
import { FIRST_DATA_ROW, formatDateCell, formatNumberCell, formatWorkbookSheet, HEADER_ROW, type ColumnUnit } from './format-workbook-sheet.ts';

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

const FIXED_UNITS: (ColumnUnit | null)[] = [null, null, null, null, null, 'vnd', null];

export type DocumentsWorkbook = { title: string; createdAt: Date; rows: ExportRow[] };

export async function buildDocumentsWorkbook({ title, createdAt, rows }: DocumentsWorkbook): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giấy tờ');
  const factColumns = collectFactColumns(rows);
  sheet.getRow(HEADER_ROW).values = [...HEADER_LABELS, ...factColumns.map((column) => column.name)];
  rows.forEach((row, index) => writeDataRow(sheet.getRow(FIRST_DATA_ROW + index), row, factColumns));
  const factUnits = factColumns.map((column) => chooseValueUnit(rows.flatMap((row) => row.fact_values.filter((value) => value.key === column.key))));
  formatWorkbookSheet(sheet, { title, createdAt, lastDataRow: HEADER_ROW + rows.length, units: [...FIXED_UNITS, ...factUnits] });
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

function writeDataRow(row: ExcelJS.Row, data: ExportRow, factColumns: FactColumn[]): void {
  row.values = [null, data.kind, data.title, data.document_number, data.vehicle_plate, null, data.sender_name];
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
