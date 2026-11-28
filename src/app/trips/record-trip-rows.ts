import type { ReportColumn } from '../documents/build-report-workbook.ts';
import { describeRecordedUnit, listSourceEntryIds, type RecordedCell, type RecordedColumn, type RecordedRow } from '../documents/recorded-export.ts';
import type { Trip } from './build-trips.ts';
import { listTripPapers, readRouteEntryId, type Reading } from './read-trip-cell.ts';

export function describeTripColumns(columns: ReportColumn[]): RecordedColumn[] {
  return columns.map((column, position) => ({ key: `c${position}`, name: column.name, value_type: column.type, ...describeRecordedUnit(column.unit) }));
}

export function recordTripRows(rowIds: string[], trips: Trip[], columns: RecordedColumn[], cellReads: Reading[][]): RecordedRow[] {
  return trips.map((trip, position) => recordTripRow(rowIds[position]!, trip, columns, cellReads[position]!));
}

function recordTripRow(id: string, trip: Trip, columns: RecordedColumn[], readings: Reading[]): RecordedRow {
  const cells = Object.fromEntries(columns.map((column, position) => [column.key, recordTripCell(column, readings[position]!)]));
  const routeEntryId = readRouteEntryId(trip);
  const entryIds = [...new Set([...listSourceEntryIds(cells), ...(routeEntryId === null ? [] : [routeEntryId])])];
  return { id, documentIds: listTripPapers(trip).map((paper) => paper.id), entryIds, cells };
}

function recordTripCell({ value_type: valueType }: RecordedColumn, { value, source }: Reading): RecordedCell {
  return { value_type: valueType, value: valueType === 'text' && typeof value === 'number' ? String(value) : value, source };
}
