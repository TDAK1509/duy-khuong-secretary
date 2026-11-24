import type { TripPaper } from './list-trip-papers.ts';
import type { PairMethod, TripPairing } from './pair-trips.ts';

export type Trip = { pickup: TripPaper | null; dropOff: TripPaper | null; method: PairMethod | null };

export type TripPapers = { pickups: TripPaper[]; receipts: TripPaper[]; dateFrom: string; dateTo: string };

export function buildTrips({ pickups, receipts, dateFrom, dateTo }: TripPapers, pairing: TripPairing): Trip[] {
  const receiptsById = new Map(receipts.map((paper) => [paper.id, paper]));
  const pairedReceiptIds = new Set([...pairing.pairs.values()].map((pair) => pair.receiptId));
  const pickupTrips = pickups.filter((paper) => isInRange(paper, dateFrom, dateTo)).map((pickup): Trip => {
    const pair = pairing.pairs.get(pickup.id);
    return { pickup, dropOff: pair === undefined ? null : (receiptsById.get(pair.receiptId) ?? null), method: pair?.method ?? null };
  });
  const dropOffTrips = receipts
    .filter((paper) => isInRange(paper, dateFrom, dateTo) && !pairedReceiptIds.has(paper.id))
    .map((dropOff): Trip => ({ pickup: null, dropOff, method: null }));
  return [...pickupTrips, ...dropOffTrips].sort(compareTrips);
}

export function isInRange(paper: TripPaper, dateFrom: string, dateTo: string): boolean {
  return paper.document_date !== null && paper.document_date >= dateFrom && paper.document_date <= dateTo;
}

function compareTrips(first: Trip, second: Trip): number {
  return compareText(readTripDate(first), readTripDate(second)) || compareText(readTripPlate(first), readTripPlate(second)) || compareText(readFirstId(first), readFirstId(second));
}

export function readTripDate(trip: Trip): string | null {
  return (trip.pickup ?? trip.dropOff)?.document_date ?? null;
}

export function readTripPlate(trip: Trip): string | null {
  return (trip.pickup ?? trip.dropOff)?.vehicle_plate ?? null;
}

function readFirstId(trip: Trip): string {
  return (trip.pickup ?? trip.dropOff)?.id ?? '';
}

function compareText(first: string | null, second: string | null): number {
  if (first === second) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first < second ? -1 : 1;
}
