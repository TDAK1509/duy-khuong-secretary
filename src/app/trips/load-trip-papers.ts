import type { Database } from '../db/transaction.ts';
import { dropRepeatedPapers, type RepeatedPaper } from './drop-repeated-papers.ts';
import { listReceiptPapers, listTripPapers, type TripPaperQuery } from './list-trip-papers.ts';
import type { PairingPapers } from './pair-trips.ts';

export const MAX_TRIP_PAPERS = 5000;
export const DAY_MS = 86_400_000;
export const TOO_MANY_PAPERS_ERROR = `Có hơn ${MAX_TRIP_PAPERS} giấy tờ chuyến trong khoảng này. Hãy chọn khoảng ngắn hơn hoặc một xe.`;

export type LoadedPapers = PairingPapers & { repeats: RepeatedPaper[] };

export async function loadTripPapers(database: Database, query: TripPaperQuery): Promise<LoadedPapers | null> {
  const pickups = await listTripPapers(database, { ...query, dateFrom: addDays(query.dateFrom, -1) });
  const receipts = await listReceiptPapers(database, { ...query, dateFrom: addDays(query.dateFrom, -1), dateTo: addDays(query.dateTo, 1) });
  if (pickups.length > MAX_TRIP_PAPERS || receipts.length > MAX_TRIP_PAPERS) return null;
  const withoutRepeatedPickups = dropRepeatedPapers(pickups, 'pickup');
  const withoutRepeatedReceipts = dropRepeatedPapers(receipts, 'dropOff');
  return { pickups: withoutRepeatedPickups.papers, receipts: withoutRepeatedReceipts.papers, repeats: [...withoutRepeatedPickups.repeats, ...withoutRepeatedReceipts.repeats] };
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
