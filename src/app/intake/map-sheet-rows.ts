import { createHash } from 'node:crypto';
import { buildMatchKey } from '../documents/build-match-key.ts';
import type { DocumentDraft, PlannedItem } from '../documents/document-draft.ts';
import type { ReadingItem } from '../reading/reading.ts';
import type { NewRecord, RecordDetail } from '../records/new-record.ts';
import type { SheetRow } from '../../services/sheets/sheet-parser.ts';
import { normalizeCode } from '../reading/normalize.ts';
import { buildSheetLine } from './sheet-line-values.ts';
import type { SheetDateFormat, SheetMappingField, SheetReading } from './sheet-reader-schema.ts';

export type SheetMappingPlan = {
  kind: string;
  signature: string;
  dateFormat: SheetDateFormat;
  dateIndex: number;
  titleIndex: number | null;
  plateIndex: number | null;
  numberIndex: number | null;
  issuerIndex: number | null;
  summaryIndex: number | null;
  details: { index: number; label: string }[];
};

export type SkipReason = 'header' | 'total' | 'no_date' | 'no_plate';

const TOTAL_ROW = /^(tổng\s*cộng|tổng|cộng)\s*[:.]?\s*$/iu;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function planSheetMapping(reading: SheetReading, headers: string[]): SheetMappingPlan {
  const indexOf = (field: SheetMappingField) => reading.columnMapping.find((role) => role.field === field)?.columnIndex ?? null;
  return {
    kind: reading.documentKind,
    signature: signHeaderRow(headers),
    dateFormat: reading.dateFormat,
    dateIndex: indexOf('document_date') ?? 0,
    titleIndex: indexOf('title'),
    plateIndex: indexOf('vehicle_plate'),
    numberIndex: indexOf('document_number'),
    issuerIndex: indexOf('issuer_key'),
    summaryIndex: indexOf('summary'),
    details: reading.columnMapping.filter((role) => role.field === 'detail').map((role) => ({ index: role.columnIndex, label: headers[role.columnIndex] ?? '' })),
  };
}

function signHeaderRow(headers: string[]): string {
  const keys = headers.map(buildMatchKey).filter((key) => key !== '');
  return createHash('sha256').update(JSON.stringify(keys)).digest('hex');
}

export type RowAttempt =
  | { ok: true; rowNumber: number; draft: DocumentDraft }
  | { ok: false; rowNumber: number; reason: SkipReason };

export type DataRow = { row: SheetRow; position: number };

export function mapRowToDraft(plan: SheetMappingPlan, { row, position }: DataRow, headers: string[]): RowAttempt {
  const checked = checkRow(plan, row, headers);
  if (!checked.ok) return { ok: false, rowNumber: row.rowNumber, reason: checked.reason };
  const { documentDate } = checked;
  const plate = readPlate(plan, row.cells);
  const title = readCell(row.cells, plan.titleIndex) ?? [plan.kind, plate, formatVietnamDate(documentDate)].filter((part) => part !== null && part !== '').join(' ');
  return { ok: true, rowNumber: row.rowNumber, draft: buildDraft(plan, row.cells, { itemIndex: position, documentDate, title, plate }) };
}

type CheckedRow = { ok: true; documentDate: string } | { ok: false; reason: SkipReason };

function checkRow(plan: SheetMappingPlan, { cells }: SheetRow, headers: string[]): CheckedRow {
  if (headers.every((header, index) => header === (cells[index] ?? ''))) return { ok: false, reason: 'header' };
  if (TOTAL_ROW.test((cells.find((cell) => cell !== '') ?? '').normalize('NFC'))) return { ok: false, reason: 'total' };
  const documentDate = parseSheetDate(cells[plan.dateIndex] ?? '', plan.dateFormat);
  if (documentDate === null) return { ok: false, reason: 'no_date' };
  if (plan.plateIndex !== null && readPlate(plan, cells) === null) return { ok: false, reason: 'no_plate' };
  return { ok: true, documentDate };
}

function readPlate(plan: SheetMappingPlan, cells: string[]): string | null {
  return plan.plateIndex === null ? null : normalizeCode(cells[plan.plateIndex] ?? '');
}

function readCell(cells: string[], index: number | null): string | null {
  if (index === null) return null;
  const value = cells[index]?.trim() ?? '';
  return value === '' ? null : value;
}

function formatVietnamDate(isoDate: string): string {
  return isoDate.split('-').reverse().join('/');
}

type DraftInputs = { itemIndex: number; documentDate: string; title: string; plate: string | null };

function buildDraft(plan: SheetMappingPlan, cells: string[], inputs: DraftInputs): DocumentDraft {
  const fields = collectRowFields(plan, cells, inputs);
  const planned = buildPlannedItem(plan.kind, inputs, fields);
  return { issuerKey: fields.issuerKey, documentNumber: fields.documentNumber, documentDate: inputs.documentDate, vehiclePlate: fields.plate, items: [planned], lineItems: [planned] };
}

type RowFields = { plate: string | null; documentNumber: string | null; issuerKey: string | null; summary: string; details: RecordDetail[] };

function collectRowFields(plan: SheetMappingPlan, cells: string[], inputs: DraftInputs): RowFields {
  return {
    plate: inputs.plate,
    documentNumber: readCell(cells, plan.numberIndex),
    issuerKey: readCell(cells, plan.issuerIndex),
    summary: readCell(cells, plan.summaryIndex) ?? inputs.title,
    details: buildDetails(plan, cells),
  };
}

function buildPlannedItem(kind: string, inputs: DraftInputs, fields: RowFields): PlannedItem {
  return { item: buildReadingItem(kind, inputs, fields), record: buildNewRecord(kind, inputs, fields) };
}

function buildReadingItem(kind: string, inputs: DraftInputs, fields: RowFields): ReadingItem {
  const lines = fields.details.filter((detail) => detail.value.trim() !== '').map((detail) => buildSheetLine(detail.label, detail.value));
  return {
    category: kind, document_title: inputs.title, maintenance_item: null, occurred_on: inputs.documentDate,
    amount_vnd: null, identifiers: [], vehicle_plate: fields.plate, document_number: fields.documentNumber,
    document_kind: kind, stage: null, parties: [], details: lines, template: null,
  };
}

function buildNewRecord(kind: string, inputs: DraftInputs, fields: RowFields): NewRecord {
  return {
    itemIndex: inputs.itemIndex, category: kind, documentTitle: inputs.title, maintenanceItem: null,
    vehiclePlate: fields.plate, documentNumber: fields.documentNumber, occurredOn: inputs.documentDate,
    amountVnd: null, identifiers: [], summary: fields.summary, details: fields.details,
  };
}

function buildDetails(plan: SheetMappingPlan, cells: string[]): RecordDetail[] {
  return plan.details.map(({ index, label }) => ({ label, value: cells[index] ?? '', number: null, unit: null }));
}

export function parseSheetDate(cell: string, format: SheetDateFormat): string | null {
  const trimmed = cell.trim();
  if (trimmed === '') return null;
  const parsed = ISO_DATE.test(trimmed) ? applyDateFormat(trimmed, 'YYYY-MM-DD') : applyDateFormat(trimmed, format);
  if (parsed === null) return null;
  return isRealDate(parsed.year, parsed.month, parsed.day) ? toIso(parsed) : null;
}

type DateParts = { year: number; month: number; day: number };

function applyDateFormat(text: string, format: SheetDateFormat): DateParts | null {
  const match = text.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!match) return null;
  const [, a, b, c] = match;
  if (!a || !b || !c) return null;
  if (format === 'YYYY-MM-DD') return { year: Number(a), month: Number(b), day: Number(c) };
  if (format === 'DD/MM/YYYY') return { year: Number(c), month: Number(b), day: Number(a) };
  return { year: Number(c), month: Number(a), day: Number(b) };
}

function isRealDate(year: number, month: number, day: number): boolean {
  const moment = new Date(Date.UTC(year, month - 1, day));
  return moment.getUTCFullYear() === year && moment.getUTCMonth() === month - 1 && moment.getUTCDate() === day;
}

function toIso({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
