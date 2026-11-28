import type { ReportCell } from '../documents/build-report-workbook.ts';
import { buildEntrySource, buildPaperSource, buildServerSource, describeOutcomeField, type CellSource, type EntrySnapshots } from '../documents/recorded-export.ts';
import { PER_TON_UNIT, SHOWN_GOODS_MATCH_KEY } from '../facts/knowledge-outcomes.ts';
import type { Trip } from './build-trips.ts';
import type { TripPaper, WinningValue } from './list-trip-papers.ts';
import { readPickupPlace, readWeightKg } from './read-trip-paper.ts';
import { describePairingMethod } from './trip-report-texts.ts';
import type { TripColumn, TripField } from './trip-columns.ts';

export type Reading = { value: ReportCell; source: CellSource | null };

export type WinnerIndex = Map<string, WinningValue>;

export type TripContext = { winners: WinnerIndex; snapshots: EntrySnapshots };

type FieldReader = (trip: Trip, context: TripContext) => Reading;

type FirstRead<Value> = { paper: TripPaper | null; value: Value | null };

export function indexWinners(winners: WinningValue[]): WinnerIndex {
  return new Map(winners.map((winner) => [`${winner.document_id}:${winner.match_key}`, winner]));
}

export function readTripCell(column: TripColumn, trip: Trip, context: TripContext): Reading {
  if (column.source === 'none') return { value: null, source: buildServerSource('none') };
  if (column.source === 'field') return FIELD_READERS[column.field](trip, context);
  const winner = findWinner(context.winners, trip, column.matchKey);
  if (column.source === 'knowledge_value') return readKnowledgeValue(winner, column.matchKey, context);
  return readKnowledgeAmount(winner, readWinnerWeight(trip, winner), column.matchKey);
}

export function readPairingMethod(trip: Trip): Reading {
  return { value: describePairingMethod(trip.method), source: buildServerSource('pairing_method') };
}

const FIELD_READERS: Record<TripField, FieldReader> = {
  date: (trip) => readPaper(readAnchor(trip), 'document_date', (paper) => paper.document_date),
  pickup_date: (trip) => readPaper(trip.pickup, 'document_date', (paper) => paper.document_date),
  dropoff_date: (trip) => readPaper(trip.dropOff, 'document_date', (paper) => paper.document_date),
  plate: (trip) => readPaper(readAnchor(trip), 'vehicle_plate', (paper) => paper.vehicle_plate),
  route: (trip, context) => readRoute(trip, context),
  pickup_place: (trip, context) => readPickupPlaceCell(trip, context),
  dropoff_place: (trip, context) => readDropOffPlace(trip, context),
  customer: (trip, context) => readCustomer(trip, context),
  goods: (trip, context) => readGoods(trip, context),
  weight_kg: (trip) => readFirstField(trip, 'weight_kg', (paper) => readWeightKg(paper)),
  pickup_weight_kg: (trip) => readPaper(trip.pickup, 'weight_kg', (paper) => readWeightKg(paper)),
  dropoff_weight_kg: (trip) => readPaper(trip.dropOff, 'weight_kg', (paper) => readWeightKg(paper)),
  document_number: (trip) => readDocumentNumbers(trip),
  pickup_document_number: (trip) => readPaper(trip.pickup, 'document_number', (paper) => paper.document_number),
  dropoff_document_number: (trip) => readPaper(trip.dropOff, 'document_number', (paper) => paper.document_number),
  document_kind: (trip) => readFirstField(trip, 'kind', (paper) => paper.kind),
  sender: (trip) => readFirstField(trip, 'sender_name', (paper) => paper.sender_name),
};

export function listTripPapers(trip: Trip): TripPaper[] {
  return [trip.pickup, trip.dropOff].flatMap((paper) => paper ?? []);
}

function readAnchor(trip: Trip): TripPaper {
  return (trip.pickup ?? trip.dropOff) as TripPaper;
}

function readPaper(paper: TripPaper | null, field: string, read: (paper: TripPaper) => ReportCell): Reading {
  if (paper === null) return { value: null, source: null };
  return { value: read(paper), source: buildPaperSource(paper, field) };
}

function readFirst<Value>(trip: Trip, read: (paper: TripPaper) => Value | null): FirstRead<Value> {
  for (const paper of listTripPapers(trip)) {
    const value = read(paper);
    if (value !== null) return { paper, value };
  }
  return { paper: null, value: null };
}

function readFirstField(trip: Trip, field: string, read: (paper: TripPaper) => ReportCell): Reading {
  const { paper, value } = readFirst(trip, read);
  return readPaper(paper ?? readAnchor(trip), field, () => value);
}

function readRoute(trip: Trip, context: TripContext): Reading {
  const pickupPlace = trip.pickup === null ? null : readPickupPlace(trip.pickup);
  const dropOffPlace = readDropOffPlace(trip, context).value;
  const value = pickupPlace === null && dropOffPlace === null ? null : `${pickupPlace ?? '?'} → ${dropOffPlace ?? '?'}`;
  const entryId = readRouteEntryId(trip);
  const source: CellSource = { kind: 'computed', document_id: readAnchor(trip).id, ...(entryId === null ? {} : { entry_id: entryId }), field: 'route', snapshot: { pickup_place: pickupPlace, dropoff_place: dropOffPlace } };
  return { value, source };
}

export function readRouteEntryId(trip: Trip): string | null {
  return listTripPapers(trip).find((paper) => paper.route_entry_id !== null)?.route_entry_id ?? null;
}

function readPickupPlaceCell(trip: Trip, { snapshots }: TripContext): Reading {
  const { pickup } = trip;
  if (pickup === null || pickup.route_pickup === null) return readPaper(pickup, 'issuer_name', (paper) => readPickupPlace(paper));
  return { value: pickup.route_pickup, source: buildEntrySource({ entryId: pickup.route_entry_id ?? undefined, documentId: pickup.id }, 'when_pickup', pickup.route_pickup, snapshots) };
}

function readDropOffPlace(trip: Trip, { snapshots }: TripContext): Reading {
  if (trip.dropOff?.receiver_name != null) return readPaper(trip.dropOff, 'receiver_name', (paper) => paper.receiver_name);
  const { paper, value } = readFirst(trip, (candidate) => candidate.route_dropoff);
  if (paper === null) return readPaper(trip.dropOff, 'receiver_name', () => null);
  const entryId = paper.route_entry_id ?? undefined;
  const field = entryId !== undefined && snapshots.get(entryId)?.conditions['when_dropoff'] !== undefined ? 'when_dropoff' : 'then_dropoff';
  return { value, source: buildEntrySource({ entryId, documentId: paper.id }, field, value, snapshots) };
}

function readCustomer(trip: Trip, { snapshots }: TripContext): Reading {
  const { paper, value } = readFirst(trip, (candidate) => candidate.route_customer ?? candidate.customer_party);
  if (paper === null || paper.route_customer === null) return readPaper(paper ?? readAnchor(trip), 'customer_party', () => value);
  return { value, source: buildEntrySource({ entryId: paper.route_entry_id ?? undefined, documentId: paper.id }, 'then_customer', value, snapshots) };
}

function readGoods(trip: Trip, { winners }: TripContext): Reading {
  const shown = findWinner(winners, trip, SHOWN_GOODS_MATCH_KEY)?.text ?? null;
  const { paper, value } = readFirst(trip, (candidate) => candidate.goods_line);
  return readPaper(paper ?? readAnchor(trip), 'goods_line', () => shown ?? value);
}

function readDocumentNumbers(trip: Trip): Reading {
  const numbered = listTripPapers(trip).filter((paper) => paper.document_number !== null);
  if (numbered.length !== 2) return readFirstField(trip, 'document_number', (paper) => paper.document_number);
  const numbers = numbered.map((paper) => paper.document_number);
  return { value: numbers.join(' / '), source: { kind: 'computed', document_id: numbered[0]!.id, field: 'document_number', snapshot: { document_ids: numbered.map((paper) => paper.id), numbers } } };
}

export function findWinner(index: WinnerIndex, trip: Trip, matchKey: string): WinningValue | undefined {
  return [trip.pickup, trip.dropOff].flatMap((paper) => (paper === null ? [] : (index.get(`${paper.id}:${matchKey}`) ?? []))).at(0);
}

function readKnowledgeValue(winner: WinningValue | undefined, matchKey: string, { snapshots }: TripContext): Reading {
  const value = readWinner(winner);
  return { value, source: buildEntrySource({ entryId: winner?.entry_id, documentId: winner?.document_id }, describeOutcomeField(matchKey), value, snapshots) };
}

function readKnowledgeAmount(winner: WinningValue | undefined, weightKg: number | null, matchKey: string): Reading {
  const rate = winner?.number == null ? null : Number(winner.number);
  const source: CellSource = {
    kind: 'computed',
    ...(winner === undefined ? {} : { document_id: winner.document_id, entry_id: winner.entry_id }),
    field: describeOutcomeField(matchKey),
    snapshot: { rate_vnd_per_ton: rate, weight_kg: weightKg },
  };
  return { value: calculateAmount(winner, weightKg), source };
}

function readWinner(winner: WinningValue | undefined): ReportCell {
  if (winner === undefined) return null;
  return winner.number === null ? winner.text : Number(winner.number);
}

function calculateAmount(winner: WinningValue | undefined, weightKg: number | null): number | null {
  if (winner?.number == null || winner.unit !== PER_TON_UNIT || weightKg === null) return null;
  return Math.round((Number(winner.number) * weightKg) / 1000);
}

export function readWinnerWeight(trip: Trip, winner: WinningValue | undefined): number | null {
  if (winner === undefined) return null;
  return readWeightKg([trip.pickup, trip.dropOff].find((paper) => paper?.id === winner.document_id) ?? null);
}
