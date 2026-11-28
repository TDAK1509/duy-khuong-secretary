import { OUTCOME_DEFINITIONS, PER_TON_UNIT } from '../facts/knowledge-outcomes.ts';
import type { ColumnUnit } from './column-units.ts';

export type ValueType = 'text' | 'number' | 'date' | 'boolean';

export type CellValue = string | number | boolean | null;

export type CellSource = {
  kind: 'paper' | 'entry' | 'computed' | 'server';
  document_id?: string;
  entry_id?: string;
  field: string;
  snapshot: Record<string, unknown>;
};

export type RecordedCell = { value_type: ValueType; value: CellValue; source: CellSource | null };

export type RecordedColumn = { key: string; name: string; value_type: ValueType; unit?: string };

export type RecordedRow = { id: string; documentIds: string[]; entryIds: string[]; cells: Record<string, RecordedCell> };

export type PaperFacts = { id: string; kind: string; document_number: string | null; document_date: string | null; vehicle_plate: string | null };

export type EntrySnapshot = { statement: string; conditions: Record<string, string> };

export type EntrySnapshots = Map<string, EntrySnapshot>;

const PRINTED_UNITS: Partial<Record<ColumnUnit, string>> = { vnd: 'đ', kg: 'kg', ton: 'tấn', liter: 'lít', rate: PER_TON_UNIT };

export function describeRecordedUnit(unit: ColumnUnit | null | undefined): { unit?: string } {
  const printed = unit === null || unit === undefined ? undefined : PRINTED_UNITS[unit];
  return printed === undefined ? {} : { unit: printed };
}

export function buildPaperSource(paper: PaperFacts, field: string): CellSource {
  const snapshot = { kind: paper.kind, number: paper.document_number, date: paper.document_date, plate: paper.vehicle_plate };
  return { kind: 'paper', document_id: paper.id, field, snapshot };
}

export type EntryReference = { entryId?: string; documentId?: string };

export function buildEntrySource({ entryId, documentId }: EntryReference, field: string, value: CellValue, snapshots: EntrySnapshots): CellSource {
  const entry = entryId === undefined ? undefined : snapshots.get(entryId);
  const snapshot = entry === undefined ? {} : { statement: entry.statement, conditions: entry.conditions, value };
  return { kind: 'entry', ...(documentId === undefined ? {} : { document_id: documentId }), ...(entryId === undefined ? {} : { entry_id: entryId }), field, snapshot };
}

export function buildServerSource(field: string): CellSource {
  return { kind: 'server', field, snapshot: {} };
}

export function listSourceEntryIds(cells: Record<string, RecordedCell>): string[] {
  return Object.values(cells).flatMap((cell) => cell.source?.entry_id ?? []);
}

export function describeOutcomeField(matchKey: string): string {
  return OUTCOME_DEFINITIONS.find((outcome) => outcome.matchKey === matchKey)?.column ?? matchKey;
}
