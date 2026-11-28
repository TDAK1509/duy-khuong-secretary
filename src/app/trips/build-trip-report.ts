import type { ReportColumn, ReportTable } from '../documents/build-report-workbook.ts';
import type { EntrySnapshots, RecordedColumn, RecordedRow } from '../documents/recorded-export.ts';
import type { NoteBlock } from '../documents/add-note-sheet.ts';
import { chooseValueUnit } from '../documents/choose-value-unit.ts';
import type { ColumnUnit } from '../documents/format-workbook-sheet.ts';
import { isInRange, readTripPlate, type Trip } from './build-trips.ts';
import { describeRepeatedPapers, describeTripNotes } from './describe-trip-notes.ts';
import type { RepeatedPaper } from './drop-repeated-papers.ts';
import type { TripPaper, WinningValue } from './list-trip-papers.ts';
import type { DropOffMatching } from './match-drop-off-names.ts';
import type { TripPairing } from './pair-trips.ts';
import { findWinner, indexWinners, readPairingMethod, readTripCell, type WinnerIndex } from './read-trip-cell.ts';
import { describeTripColumns, recordTripRows } from './record-trip-rows.ts';
import { groupPossibleDuplicates, readPickupIssuer, readPickupPlace } from './read-trip-paper.ts';
import { NO_NUMBER } from './trip-report-texts.ts';
import type { TripColumn, TripField } from './trip-columns.ts';

export type PossibleDuplicate = { plate: string; date: string; pickup: string; documentNumbers: string[] };

export type TripReport = {
  table: ReportTable;
  recordedColumns: RecordedColumn[];
  records: RecordedRow[];
  namedColumns: ReportColumn[];
  rowsPerPlate: Record<string, number>;
  reviewPapers: number;
  missingWeight: number;
  repeatedPapers: number;
  duplicates: PossibleDuplicate[];
  noSourceColumns: string[];
  emptyColumns: string[];
  counts: TripCounts;
};

export type TripCounts = { trips: number; both: number; pickupOnly: number; dropOffOnly: number; byRule: number; byAi: number };

const NO_PLATE = '(không biển số)';

const PAIRING_METHOD_COLUMN: ReportColumn = { name: 'Cách ghép phiếu', type: 'text', unit: null };

export type TripReportInput = { title: string; createdAt: Date; columns: TripColumn[]; trips: Trip[]; pickups: TripPaper[]; repeats: RepeatedPaper[]; winners: WinningValue[]; reviewPapers: number; pairing: TripPairing; matching: DropOffMatching; snapshots: EntrySnapshots; rowIds: string[]; dateFrom: string; dateTo: string };

export function buildTripReport({ title, createdAt, columns, trips, pickups, repeats, winners, reviewPapers, pairing, matching, snapshots, rowIds, dateFrom, dateTo }: TripReportInput): TripReport {
  const index = indexWinners(winners);
  const context = { winners: index, snapshots };
  const cellReads = trips.map((trip) => [...columns.map((column) => readTripCell(column, trip, context)), readPairingMethod(trip)]);
  const rows = cellReads.map((row) => row.map((cell) => cell.value));
  const noSourceColumns = columns.filter((column) => column.source === 'none').map((column) => column.name);
  const emptyColumns = columns.filter((column, position) => column.source !== 'none' && rows.every((cells) => cells[position] === null)).map((column) => column.name);
  const duplicates = groupPossibleDuplicates(pickups.filter((paper) => isInRange(paper, dateFrom, dateTo))).map(describeDuplicate);
  const missingWeight = listTripPapers(trips).filter((paper) => paper.weight_kg === null).length;
  const counts = countTrips(trips);
  const repeatsInPeriod = repeats.filter(({ paper }) => isInRange(paper, dateFrom, dateTo));
  const notes = [...buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }), ...describeRepeatedPapers(repeatsInPeriod), ...describeTripNotes(trips, counts, pairing, matching)];
  const namedColumns = columns.map((column) => describeColumn(column, trips, index));
  const table = { title, createdAt, columns: [...namedColumns, PAIRING_METHOD_COLUMN], rows, extraSheets: [{ name: 'Ghi chú', blocks: notes }] };
  const recordedColumns = describeTripColumns(table.columns);
  const records = recordTripRows(rowIds, trips, recordedColumns, cellReads);
  return { table, recordedColumns, records, namedColumns, rowsPerPlate: countRowsPerPlate(trips), reviewPapers, missingWeight, repeatedPapers: repeatsInPeriod.length, duplicates, noSourceColumns, emptyColumns, counts };
}

function describeDuplicate(group: TripPaper[]): PossibleDuplicate {
  const [first] = group as [TripPaper, ...TripPaper[]];
  return {
    plate: first.vehicle_plate ?? NO_PLATE,
    date: first.document_date ?? '',
    pickup: readPickupPlace(first) ?? readPickupIssuer(first) ?? '',
    documentNumbers: group.map((paper) => paper.document_number ?? NO_NUMBER),
  };
}

function listTripPapers(trips: Trip[]): TripPaper[] {
  return trips.flatMap((trip) => [...(trip.pickup === null ? [] : [trip.pickup]), ...(trip.dropOff === null ? [] : [trip.dropOff])]);
}

function countTrips(trips: Trip[]): TripCounts {
  const both = trips.filter((trip) => trip.pickup !== null && trip.dropOff !== null).length;
  const byAi = trips.filter((trip) => trip.method === 'ai').length;
  return { trips: trips.length, both, pickupOnly: trips.filter((trip) => trip.dropOff === null).length, dropOffOnly: trips.filter((trip) => trip.pickup === null).length, byRule: both - byAi, byAi };
}

type NoteFacts = { noSourceColumns: string[]; emptyColumns: string[]; reviewPapers: number; missingWeight: number; duplicates: PossibleDuplicate[] };

function buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }: NoteFacts): NoteBlock[] {
  return [
    { kind: 'label', label: 'Cột chưa có dữ liệu đã lưu', value: listNames(noSourceColumns) },
    { kind: 'label', label: 'Cột trống ở mọi dòng', value: listNames(emptyColumns) },
    { kind: 'label', label: 'Giấy tờ đang chờ duyệt, chưa có trong bảng', value: String(reviewPapers) },
    { kind: 'label', label: 'Giấy tờ thiếu trọng lượng hàng', value: String(missingWeight) },
    { kind: 'blank' },
    { kind: 'label', label: 'Có thể trùng chuyến (cùng xe, cùng ngày, cùng nơi lấy hàng)', value: duplicates.length === 0 ? 'Không có' : String(duplicates.length) },
    ...(duplicates.length === 0 ? [] : [{ kind: 'table' as const, header: ['Biển số', 'Ngày', 'Nơi lấy hàng', 'Số chứng từ'], rows: duplicates.map(describeDuplicateRow) }]),
  ];
}

function listNames(names: string[]): string {
  return names.length === 0 ? 'Không có' : names.join(', ');
}

function describeDuplicateRow({ plate, date, pickup, documentNumbers }: PossibleDuplicate): string[] {
  const [year, month, day] = date.split('-');
  return [plate, `${day}/${month}/${year}`, pickup, documentNumbers.join(', ')];
}

const DATE_FIELDS: TripField[] = ['date', 'pickup_date', 'dropoff_date'];
const KG_FIELDS: TripField[] = ['weight_kg', 'pickup_weight_kg', 'dropoff_weight_kg'];

function describeColumn(column: TripColumn, trips: Trip[], index: WinnerIndex): ReportColumn {
  const type = chooseColumnType(column, trips, index);
  return { name: column.name, type, unit: type === 'number' ? chooseColumnUnit(column, trips, index) : null };
}

function chooseColumnType(column: TripColumn, trips: Trip[], index: WinnerIndex): ReportColumn['type'] {
  if (column.source === 'knowledge_amount') return 'number';
  if (column.source === 'knowledge_value') return listWinners(column, trips, index).some((winner) => winner.number != null) ? 'number' : 'text';
  if (column.source !== 'field') return 'text';
  if (DATE_FIELDS.includes(column.field)) return 'date';
  return KG_FIELDS.includes(column.field) ? 'number' : 'text';
}

function chooseColumnUnit(column: TripColumn, trips: Trip[], index: WinnerIndex): ColumnUnit | null {
  if (column.source === 'knowledge_amount') return 'vnd';
  if (column.source === 'field' && KG_FIELDS.includes(column.field)) return 'kg';
  if (column.source !== 'knowledge_value') return null;
  return chooseValueUnit(listWinners(column, trips, index));
}

function listWinners(column: TripColumn & { matchKey: string }, trips: Trip[], index: WinnerIndex): WinningValue[] {
  return trips.flatMap((trip) => findWinner(index, trip, column.matchKey) ?? []);
}

function countRowsPerPlate(trips: Trip[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const trip of trips) {
    const plate = readTripPlate(trip) ?? NO_PLATE;
    counts[plate] = (counts[plate] ?? 0) + 1;
  }
  return counts;
}
