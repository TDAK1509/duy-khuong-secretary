import type { ReportCell, ReportColumn, ReportTable } from '../documents/build-report-workbook.ts';
import { GOODS_VALUE_KEY } from '../facts/fact.ts';
import { PER_TON_UNIT } from '../facts/total-fact-values.ts';
import type { NoteBlock } from '../documents/add-note-sheet.ts';
import { chooseValueUnit } from '../documents/choose-value-unit.ts';
import { INFERRED_MARK, type ColumnUnit } from '../documents/format-workbook-sheet.ts';
import { isInRange, readTripDate, readTripPlate, type Trip } from './build-trips.ts';
import { describeTripNotes } from './describe-trip-notes.ts';
import type { TripPaper, WinningValue } from './list-trip-papers.ts';
import type { TripPairing } from './pair-trips.ts';
import { groupPossibleDuplicates, readPickupIssuer, readPickupPlace, readWeightKg } from './read-trip-paper.ts';
import { NO_NUMBER } from './trip-report-texts.ts';

export const TRIP_FIELDS = [
  'date', 'pickup_date', 'dropoff_date', 'plate', 'route', 'pickup_place', 'dropoff_place', 'customer', 'goods',
  'weight_kg', 'pickup_weight_kg', 'dropoff_weight_kg', 'document_number', 'pickup_document_number', 'dropoff_document_number', 'document_kind', 'sender',
] as const;

export type TripField = (typeof TRIP_FIELDS)[number];

export type TripColumn = { name: string } & (
  | { source: 'field'; field: TripField }
  | { source: 'fact_value'; matchKey: string }
  | { source: 'fact_amount'; matchKey: string }
  | { source: 'none' }
);

export type PossibleDuplicate = { plate: string; date: string; pickup: string; documentNumbers: string[] };

export type TripReport = {
  table: ReportTable;
  rowsPerPlate: Record<string, number>;
  reviewPapers: number;
  missingWeight: number;
  duplicates: PossibleDuplicate[];
  noSourceColumns: string[];
  emptyColumns: string[];
  counts: TripCounts;
};

export type TripCounts = { trips: number; both: number; pickupOnly: number; dropOffOnly: number; byRule: number; byAi: number };

export { GOODS_VALUE_KEY };

const NO_PLATE = '(không biển số)';

type WinnerIndex = Map<string, WinningValue>;

export type TripReportInput = { title: string; createdAt: Date; columns: TripColumn[]; trips: Trip[]; pickups: TripPaper[]; winners: WinningValue[]; reviewPapers: number; pairing: TripPairing; dateFrom: string; dateTo: string };

export function buildTripReport({ title, createdAt, columns, trips, pickups, winners, reviewPapers, pairing, dateFrom, dateTo }: TripReportInput): TripReport {
  const index: WinnerIndex = new Map(winners.map((winner) => [`${winner.document_id}:${winner.match_key}`, winner]));
  const rows = trips.map((trip) => columns.map((column) => readCell(column, trip, index)));
  const noSourceColumns = columns.filter((column) => column.source === 'none').map((column) => column.name);
  const emptyColumns = columns.filter((column, position) => column.source !== 'none' && rows.every((cells) => cells[position] === null)).map((column) => column.name);
  const duplicates = groupPossibleDuplicates(pickups.filter((paper) => isInRange(paper, dateFrom, dateTo))).map(describeDuplicate);
  const missingWeight = listTripPapers(trips).filter((paper) => paper.weight_kg === null).length;
  const counts = countTrips(trips);
  const notes = [...buildNoteRows({ noSourceColumns, emptyColumns, reviewPapers, missingWeight, duplicates }), ...describeTripNotes(trips, counts, pairing)];
  const table = { title, createdAt, columns: columns.map((column) => describeColumn(column, trips, index)), rows, extraSheets: [{ name: 'Ghi chú', blocks: notes }] };
  return { table, rowsPerPlate: countRowsPerPlate(trips), reviewPapers, missingWeight, duplicates, noSourceColumns, emptyColumns, counts };
}

function readCell(column: TripColumn, trip: Trip, index: WinnerIndex): ReportCell {
  if (column.source === 'none') return null;
  if (column.source === 'field') return FIELD_READERS[column.field](trip, index);
  const winner = findWinner(index, trip, column.matchKey);
  if (column.source === 'fact_value') return readWinner(winner);
  return calculateAmount(winner, readWinnerWeight(trip, winner));
}

type FieldReader = (trip: Trip, index: WinnerIndex) => ReportCell;

const FIELD_READERS: Record<TripField, FieldReader> = {
  date: (trip) => readTripDate(trip),
  pickup_date: ({ pickup }) => pickup?.document_date ?? null,
  dropoff_date: ({ dropOff }) => dropOff?.document_date ?? null,
  plate: (trip) => readTripPlate(trip),
  route: (trip) => describeRoute(trip),
  pickup_place: ({ pickup }) => (pickup === null ? null : readPickupPlace(pickup)),
  dropoff_place: (trip) => describeDropOffPlace(trip),
  customer: (trip) => readFirst(trip, (paper) => paper.route_customer ?? paper.customer_party),
  goods: (trip, index) => readGoods(trip, index),
  weight_kg: ({ pickup, dropOff }) => readWeightKg(pickup) ?? readWeightKg(dropOff),
  pickup_weight_kg: ({ pickup }) => readWeightKg(pickup),
  dropoff_weight_kg: ({ dropOff }) => readWeightKg(dropOff),
  document_number: ({ pickup, dropOff }) => joinNumbers(pickup, dropOff),
  pickup_document_number: ({ pickup }) => pickup?.document_number ?? null,
  dropoff_document_number: ({ dropOff }) => dropOff?.document_number ?? null,
  document_kind: (trip) => readFirst(trip, (paper) => paper.kind),
  sender: (trip) => readFirst(trip, (paper) => paper.sender_name),
};

function findWinner(index: WinnerIndex, trip: Trip, matchKey: string): WinningValue | undefined {
  return [trip.pickup, trip.dropOff].flatMap((paper) => (paper === null ? [] : (index.get(`${paper.id}:${matchKey}`) ?? []))).at(0);
}

function readWinner(winner: WinningValue | undefined): ReportCell {
  if (winner === undefined) return null;
  return winner.number === null ? winner.text : Number(winner.number);
}

function calculateAmount(winner: WinningValue | undefined, weightKg: number | null): number | null {
  if (winner?.number == null || winner.unit !== PER_TON_UNIT || weightKg === null) return null;
  return Math.round((Number(winner.number) * weightKg) / 1000);
}

function readWinnerWeight(trip: Trip, winner: WinningValue | undefined): number | null {
  if (winner === undefined) return null;
  return readWeightKg([trip.pickup, trip.dropOff].find((paper) => paper?.id === winner.document_id) ?? null);
}

function readFirst(trip: Trip, read: (paper: TripPaper) => string | null): string | null {
  return [trip.pickup, trip.dropOff].flatMap((paper) => (paper === null ? [] : (read(paper) ?? []))).at(0) ?? null;
}

function joinNumbers(pickup: TripPaper | null, dropOff: TripPaper | null): string | null {
  const numbers = [pickup, dropOff].flatMap((paper) => paper?.document_number ?? []);
  return numbers.length === 0 ? null : numbers.join(' / ');
}

function readGoods(trip: Trip, index: WinnerIndex): string | null {
  return describeWinnerText(findWinner(index, trip, GOODS_VALUE_KEY)) ?? readFirst(trip, (paper) => paper.goods_line);
}

function describeWinnerText(winner: WinningValue | undefined): string | null {
  if (winner === undefined) return null;
  return winner.text ?? `${winner.number}${winner.unit ?? ''}`;
}

function describeRoute(trip: Trip): string | null {
  const pickup = trip.pickup === null ? null : readPickupPlace(trip.pickup);
  const dropOff = findDropOffPlace(trip);
  if (pickup === null && dropOff === null) return null;
  return `${pickup ?? '?'} → ${dropOff === null ? '?' : markInferred(dropOff)}`;
}

function describeDropOffPlace(trip: Trip): string | null {
  const place = findDropOffPlace(trip);
  return place === null ? null : markInferred(place);
}

type DropOffPlace = { name: string; isInferred: boolean };

function findDropOffPlace(trip: Trip): DropOffPlace | null {
  const named = readFirst(trip, (paper) => paper.route_dropoff);
  if (named !== null) return { name: named, isInferred: false };
  const receiver = trip.dropOff?.receiver_name ?? null;
  return receiver === null ? null : { name: receiver, isInferred: trip.method === 'ai' };
}

function markInferred({ name, isInferred }: DropOffPlace): string {
  return isInferred ? `${name} ${INFERRED_MARK}` : name;
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
  if (column.source === 'fact_amount') return 'number';
  if (column.source === 'fact_value') return listWinners(column, trips, index).some((winner) => winner.number != null) ? 'number' : 'text';
  if (column.source !== 'field') return 'text';
  if (DATE_FIELDS.includes(column.field)) return 'date';
  return KG_FIELDS.includes(column.field) ? 'number' : 'text';
}

function chooseColumnUnit(column: TripColumn, trips: Trip[], index: WinnerIndex): ColumnUnit | null {
  if (column.source === 'fact_amount') return 'vnd';
  if (column.source === 'field' && KG_FIELDS.includes(column.field)) return 'kg';
  if (column.source !== 'fact_value') return null;
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
