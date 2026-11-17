import ExcelJS from 'exceljs';
import type { DocumentFactValue } from '../facts/document-fact-values.ts';

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
const AMOUNT_COLUMN_INDEX = 6;

export async function buildDocumentsWorkbook(rows: ExportRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giấy tờ');
  const factColumns = collectFactColumns(rows);
  addHeaderRow(sheet, factColumns);
  for (const row of rows) addDataRow(sheet, row, factColumns);
  freezeHeader(sheet);
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

function addHeaderRow(sheet: ExcelJS.Worksheet, factColumns: FactColumn[]): void {
  const row = sheet.addRow([...HEADER_LABELS, ...factColumns.map((column) => column.name)]);
  row.eachCell((cell) => {
    cell.font = { bold: true };
  });
}

function addDataRow(sheet: ExcelJS.Worksheet, data: ExportRow, factColumns: FactColumn[]): void {
  sheet.addRow([...buildRowValues(data), ...factColumns.map((column) => formatFactCell(data.fact_values, column.key))]);
  if (data.amount_vnd !== null) {
    sheet.lastRow!.getCell(AMOUNT_COLUMN_INDEX).alignment = { horizontal: 'right' };
  }
}

function buildRowValues(data: ExportRow): (string | null)[] {
  return [
    data.document_date !== null ? formatDate(data.document_date) : null,
    data.kind,
    data.title,
    data.document_number,
    data.vehicle_plate,
    data.amount_vnd !== null ? formatVnd(data.amount_vnd) : null,
    data.sender_name,
  ];
}

function formatFactCell(values: DocumentFactValue[], key: string): string | null {
  const value = values.find((candidate) => candidate.key === key);
  if (value === undefined) return null;
  if (value.number !== null && value.unit !== null) return `${formatVnd(Number(value.number))}${value.unit}`;
  return value.text;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatVnd(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function freezeHeader(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
