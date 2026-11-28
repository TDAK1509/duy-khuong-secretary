import ExcelJS from 'exceljs';
import type { DocumentKnowledge } from '../facts/document-knowledge.ts';
import { OUTCOME_DEFINITIONS, PER_TON_UNIT } from '../facts/knowledge-outcomes.ts';
import { chooseValueUnit } from './choose-value-unit.ts';
import { formatDateCell, formatNumberCell, formatWorkbookSheet, HEADER_ROW, type ColumnUnit } from './format-workbook-sheet.ts';

export type ExportRow = {
  document_date: string | null;
  kind: string;
  title: string | null;
  document_number: string | null;
  vehicle_plate: string | null;
  amount_vnd: number | null;
  sender_name: string | null;
  company_knowledge: DocumentKnowledge[];
};

type KnowledgeColumn = { key: string; header: string };

const HEADER_LABELS = ['Ngày', 'Loại', 'Tiêu đề', 'Số chứng từ', 'Biển số', 'Số tiền (VND)', 'Người gửi'] as const;
const DATE_COLUMN = 1;
const AMOUNT_COLUMN = 6;

const FIXED_UNITS: (ColumnUnit | null)[] = [null, null, null, null, null, 'vnd', null];

const KNOWLEDGE_COLUMNS: KnowledgeColumn[] = OUTCOME_DEFINITIONS.filter((outcome) => outcome.key !== 'note').map((outcome) => ({
  key: outcome.matchKey,
  header: outcome.unit === PER_TON_UNIT ? `${outcome.name} (${PER_TON_UNIT})` : outcome.name,
}));

export type DocumentsWorkbook = { title: string; createdAt: Date; rows: ExportRow[] };

export async function buildDocumentsWorkbook({ title, createdAt, rows }: DocumentsWorkbook): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Giấy tờ');
  const columns = listShownColumns(rows);
  sheet.getRow(HEADER_ROW).values = [...HEADER_LABELS, ...columns.map((column) => column.header)];
  rows.forEach((row, index) => writeDataRow(sheet.getRow(HEADER_ROW + 1 + index), row, columns));
  const knowledgeUnits = columns.map((column) => chooseValueUnit(rows.flatMap((row) => row.company_knowledge.filter((value) => value.key === column.key))));
  formatWorkbookSheet(sheet, { title, createdAt, lastDataRow: HEADER_ROW + rows.length, units: [...FIXED_UNITS, ...knowledgeUnits] });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

function listShownColumns(rows: ExportRow[]): KnowledgeColumn[] {
  const printedKeys = new Set(rows.flatMap((row) => row.company_knowledge.map((value) => value.key)));
  return KNOWLEDGE_COLUMNS.filter((column) => printedKeys.has(column.key));
}

function writeDataRow(row: ExcelJS.Row, data: ExportRow, columns: KnowledgeColumn[]): void {
  row.values = [null, data.kind, data.title, data.document_number, data.vehicle_plate, null, data.sender_name];
  if (data.document_date !== null) formatDateCell(row.getCell(DATE_COLUMN), data.document_date);
  if (data.amount_vnd !== null) formatNumberCell(row.getCell(AMOUNT_COLUMN), Math.round(data.amount_vnd));
  columns.forEach((column, index) => writeKnowledgeCell(row.getCell(HEADER_LABELS.length + index + 1), data.company_knowledge, column.key));
}

function writeKnowledgeCell(cell: ExcelJS.Cell, values: DocumentKnowledge[], key: string): void {
  const value = values.find((candidate) => candidate.key === key);
  if (value === undefined) return;
  const number = Number(value.number);
  if (value.number !== null && value.unit !== null && Number.isFinite(number)) return formatNumberCell(cell, number, value.unit);
  cell.value = value.text;
}
