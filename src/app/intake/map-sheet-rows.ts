import type { DocumentDraft, PlannedItem } from '../documents/document-draft.ts';
import type { ReadingItem } from '../reading/reading.ts';
import type { NewRecord, RecordDetail } from '../records/new-record.ts';
import type { SheetDateFormat, SheetMappingField, SheetReading } from './sheet-reader-schema.ts';
import { FALLBACK_DOCUMENT_KIND } from './sheet-reader-schema.ts';

export type HeaderRole = { header: string; field: SheetMappingField };

export type SheetMappingPlan = {
  kind: string;
  dateFormat: SheetDateFormat | null;
  dateHeader: string;
  titleHeader: string;
  roles: HeaderRole[];
};

export type MappingProblem = 'missing_date' | 'missing_title';

export type MappingResult = { ok: true; plan: SheetMappingPlan } | { ok: false; problem: MappingProblem };

export function planSheetMapping(headers: string[], reading: SheetReading): MappingResult {
  const roles = listHeaderRoles(headers, reading.column_mapping);
  const dateHeader = findSingleHeader(roles, 'document_date');
  if (dateHeader === null) return { ok: false, problem: 'missing_date' };
  const titleHeader = findSingleHeader(roles, 'title');
  if (titleHeader === null) return { ok: false, problem: 'missing_title' };
  return { ok: true, plan: { kind: trimKind(reading.document_kind), dateFormat: reading.date_format, dateHeader, titleHeader, roles } };
}

function trimKind(kind: string): string {
  const trimmed = kind.trim();
  return trimmed === '' ? FALLBACK_DOCUMENT_KIND : trimmed;
}

function listHeaderRoles(headers: string[], mapping: Record<string, SheetMappingField>): HeaderRole[] {
  return headers.map((header) => ({ header, field: mapping[header] ?? 'ignore' }));
}

function findSingleHeader(roles: HeaderRole[], field: SheetMappingField): string | null {
  const matching = roles.filter((role) => role.field === field);
  return matching.length === 1 ? matching[0]!.header : null;
}

export type RowAttempt =
  | { ok: true; rowNumber: number; draft: DocumentDraft }
  | { ok: false; rowNumber: number };

export function mapRowToDraft(plan: SheetMappingPlan, cells: string[], headers: string[], rowNumber: number): RowAttempt {
  const cellByHeader = toCellMap(headers, cells);
  const documentDate = parseSheetDate(cellByHeader[plan.dateHeader] ?? '', plan.dateFormat);
  if (documentDate === null) return { ok: false, rowNumber };
  const title = cellByHeader[plan.titleHeader]?.trim() ?? '';
  if (title === '') return { ok: false, rowNumber };
  return { ok: true, rowNumber, draft: buildDraft(plan, cellByHeader, { rowNumber, documentDate, title }) };
}

type DraftInputs = { rowNumber: number; documentDate: string; title: string };

function buildDraft(plan: SheetMappingPlan, cells: Record<string, string>, inputs: DraftInputs): DocumentDraft {
  const fields = collectRowFields(plan, cells, inputs.title);
  const planned = buildPlannedItem(plan.kind, inputs, fields);
  return { issuerKey: fields.issuerKey, documentNumber: fields.documentNumber, documentDate: inputs.documentDate, vehiclePlate: fields.plate, items: [planned], lineItems: [planned] };
}

type RowFields = { plate: string | null; documentNumber: string | null; issuerKey: string | null; summary: string; details: RecordDetail[] };

function collectRowFields(plan: SheetMappingPlan, cells: Record<string, string>, title: string): RowFields {
  return {
    plate: pickPlate(plan, cells),
    documentNumber: pickTrimmed(plan, cells, 'document_number'),
    issuerKey: pickTrimmed(plan, cells, 'issuer_key'),
    summary: pickTrimmed(plan, cells, 'summary') ?? title,
    details: buildDetails(plan, cells),
  };
}

function buildPlannedItem(kind: string, inputs: DraftInputs, fields: RowFields): PlannedItem {
  return { item: buildReadingItem(kind, inputs, fields), record: buildNewRecord(kind, inputs, fields) };
}

function buildReadingItem(kind: string, inputs: DraftInputs, fields: RowFields): ReadingItem {
  return {
    category: kind, document_title: inputs.title, maintenance_item: null, occurred_on: inputs.documentDate,
    amount_vnd: null, identifiers: [], vehicle_plate: fields.plate, document_number: fields.documentNumber,
    document_kind: kind, stage: null, parties: [], details: [],
  };
}

function buildNewRecord(kind: string, inputs: DraftInputs, fields: RowFields): NewRecord {
  return {
    itemIndex: inputs.rowNumber, category: kind, documentTitle: inputs.title, maintenanceItem: null,
    vehiclePlate: fields.plate, documentNumber: fields.documentNumber, occurredOn: inputs.documentDate,
    amountVnd: null, identifiers: [], summary: fields.summary, details: fields.details,
  };
}

function toCellMap(headers: string[], cells: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  headers.forEach((header, index) => {
    map[header] = cells[index] ?? '';
  });
  return map;
}

function pickTrimmed(plan: SheetMappingPlan, cells: Record<string, string>, field: SheetMappingField): string | null {
  const header = plan.roles.find((role) => role.field === field)?.header;
  if (header === undefined) return null;
  const value = cells[header]?.trim() ?? '';
  return value === '' ? null : value;
}

function pickPlate(plan: SheetMappingPlan, cells: Record<string, string>): string | null {
  const header = plan.roles.find((role) => role.field === 'vehicle_plate')?.header;
  if (header === undefined) return null;
  const value = cells[header]?.trim().toUpperCase() ?? '';
  return value === '' ? null : value;
}

function buildDetails(plan: SheetMappingPlan, cells: Record<string, string>): RecordDetail[] {
  const detailHeaders = plan.roles.filter((role) => role.field === 'detail').map((role) => role.header);
  return detailHeaders.map((header) => ({ label: header, value: cells[header] ?? '', number: null, unit: null }));
}

export function parseSheetDate(cell: string, format: SheetDateFormat | null): string | null {
  const trimmed = cell.trim();
  if (trimmed === '' || format === null || format === 'other') return null;
  const parsed = applyDateFormat(trimmed, format);
  if (parsed === null) return null;
  return isRealDate(parsed.year, parsed.month, parsed.day) ? toIso(parsed) : null;
}

type DateParts = { year: number; month: number; day: number };

function applyDateFormat(text: string, format: Exclude<SheetDateFormat, 'other'>): DateParts | null {
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
