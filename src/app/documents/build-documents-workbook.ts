import ExcelJS from 'exceljs';
import type { SourcedKnowledge } from '../facts/document-knowledge.ts';
import { OUTCOME_DEFINITIONS, PER_TON_UNIT } from '../facts/knowledge-outcomes.ts';
import { addExportMarks, type ExportMarks } from './add-export-marks.ts';
import { chooseValueUnit } from './choose-value-unit.ts';
import { formatDateCell, formatNumberCell, formatWorkbookSheet, HEADER_ROW, type ColumnUnit } from './format-workbook-sheet.ts';
import type { ValueType } from './recorded-export.ts';

export type ExportRow = {
  id: string;
  document_date: string | null;
  kind: string;
  title: string | null;
  document_number: string | null;
  vehicle_plate: string | null;
  amount_vnd: number | null;
  sender_name: string | null;
  company_knowledge: SourcedKnowledge[];
};

export type DocumentColumn = { key: string; header: string; type: ValueType; unit: ColumnUnit | null; origin: 'paper' | 'knowledge' };

export const DOCUMENTS_SHEET_NAME = 'Giấy tờ';

const FIXED_COLUMNS: DocumentColumn[] = [
  { key: 'document_date', header: 'Ngày', type: 'date', unit: null, origin: 'paper' },
  { key: 'kind', header: 'Loại', type: 'text', unit: null, origin: 'paper' },
  { key: 'title', header: 'Tiêu đề', type: 'text', unit: null, origin: 'paper' },
  { key: 'document_number', header: 'Số chứng từ', type: 'text', unit: null, origin: 'paper' },
  { key: 'vehicle_plate', header: 'Biển số', type: 'text', unit: null, origin: 'paper' },
  { key: 'amount_vnd', header: 'Số tiền (VND)', type: 'number', unit: 'vnd', origin: 'paper' },
  { key: 'sender_name', header: 'Người gửi', type: 'text', unit: null, origin: 'paper' },
];
const DATE_COLUMN = 1;
const AMOUNT_COLUMN = 6;

const KNOWLEDGE_COLUMNS = OUTCOME_DEFINITIONS.map((outcome) => ({
  key: outcome.matchKey,
  header: outcome.unit === PER_TON_UNIT ? `${outcome.name} (${PER_TON_UNIT})` : outcome.name,
  type: outcome.unit === null ? ('text' as const) : ('number' as const),
  origin: 'knowledge' as const,
}));

export type DocumentsWorkbook = { title: string; createdAt: Date; rows: ExportRow[]; marks: ExportMarks };

export async function buildDocumentsWorkbook({ title, createdAt, rows, marks }: DocumentsWorkbook): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(DOCUMENTS_SHEET_NAME);
  const columns = listDocumentColumns(rows);
  sheet.getRow(HEADER_ROW).values = columns.map((column) => column.header);
  rows.forEach((row, index) => writeDataRow(sheet.getRow(HEADER_ROW + 1 + index), row, columns));
  formatWorkbookSheet(sheet, { title, createdAt, lastDataRow: HEADER_ROW + rows.length, units: columns.map((column) => column.unit) });
  addExportMarks(workbook, sheet, columns.length, marks);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function listDocumentColumns(rows: ExportRow[]): DocumentColumn[] {
  const printedKeys = new Set(rows.flatMap((row) => row.company_knowledge.map((value) => value.key)));
  const shown = KNOWLEDGE_COLUMNS.filter((column) => printedKeys.has(column.key));
  return [...FIXED_COLUMNS, ...shown.map((column) => ({ ...column, unit: chooseValueUnit(rows.flatMap((row) => row.company_knowledge.filter((value) => value.key === column.key))) }))];
}

function writeDataRow(row: ExcelJS.Row, data: ExportRow, columns: DocumentColumn[]): void {
  row.values = [null, data.kind, data.title, data.document_number, data.vehicle_plate, null, data.sender_name];
  if (data.document_date !== null) formatDateCell(row.getCell(DATE_COLUMN), data.document_date);
  if (data.amount_vnd !== null) formatNumberCell(row.getCell(AMOUNT_COLUMN), Math.round(data.amount_vnd));
  columns.slice(FIXED_COLUMNS.length).forEach((column, index) => writeKnowledgeCell(row.getCell(FIXED_COLUMNS.length + index + 1), data.company_knowledge, column.key));
}

function writeKnowledgeCell(cell: ExcelJS.Cell, values: SourcedKnowledge[], key: string): void {
  const value = values.find((candidate) => candidate.key === key);
  if (value === undefined) return;
  const number = Number(value.number);
  if (value.number !== null && value.unit !== null && Number.isFinite(number)) return formatNumberCell(cell, number, value.unit);
  cell.value = value.text;
}
