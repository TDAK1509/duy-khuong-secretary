import type { DocumentColumn, ExportRow } from './build-documents-workbook.ts';
import { buildEntrySource, buildPaperSource, describeOutcomeField, describeRecordedUnit, listSourceEntryIds, type CellValue, type EntrySnapshots, type RecordedCell, type RecordedColumn, type RecordedRow } from './recorded-export.ts';

export function describeDocumentColumns(columns: DocumentColumn[]): RecordedColumn[] {
  return columns.map((column) => ({ key: column.key, name: column.header, value_type: column.type, ...describeRecordedUnit(column.unit) }));
}

export function recordDocumentRow(id: string, row: ExportRow, columns: DocumentColumn[], snapshots: EntrySnapshots): RecordedRow {
  const cells = Object.fromEntries(columns.map((column) => [column.key, recordCell(row, column, snapshots)]));
  return { id, documentIds: [row.id], entryIds: [...new Set(listSourceEntryIds(cells))], cells };
}

function recordCell(row: ExportRow, column: DocumentColumn, snapshots: EntrySnapshots): RecordedCell {
  if (column.origin === 'paper') return { value_type: column.type, value: readPaperValue(row, column.key), source: buildPaperSource(row, column.key) };
  return recordKnowledgeCell(row, column, snapshots);
}

const PAPER_VALUES: Record<string, (row: ExportRow) => CellValue> = {
  document_date: (row) => row.document_date,
  kind: (row) => row.kind,
  title: (row) => row.title,
  document_number: (row) => row.document_number,
  vehicle_plate: (row) => row.vehicle_plate,
  amount_vnd: (row) => (row.amount_vnd === null ? null : Math.round(row.amount_vnd)),
  sender_name: (row) => row.sender_name,
};

function readPaperValue(row: ExportRow, key: string): CellValue {
  return PAPER_VALUES[key]?.(row) ?? null;
}

function recordKnowledgeCell(row: ExportRow, column: DocumentColumn, snapshots: EntrySnapshots): RecordedCell {
  const winner = row.company_knowledge.find((candidate) => candidate.key === column.key);
  const value = winner === undefined ? null : column.type === 'number' ? Number(winner.number) : winner.text;
  return { value_type: column.type, value, source: buildEntrySource({ entryId: winner?.entry_id, documentId: row.id }, describeOutcomeField(column.key), value, snapshots) };
}
