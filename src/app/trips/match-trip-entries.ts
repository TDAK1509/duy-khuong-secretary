import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Database } from '../db/transaction.ts';
import type { Trip } from './build-trips.ts';
import { listPickupEntries, listUnprintedPickupEntries, type PickupEntry, type UnprintedPickupEntry } from './list-pickup-entries.ts';
import { listReceivers } from './list-receivers.ts';
import type { ExcludedLinks, TripPaper } from './list-trip-papers.ts';
import { matchDropOffNames, type DropOffMatch, type DropOffMatching, type DropOffName } from './match-drop-off-names.ts';

export type TripEntries = { trips: Trip[]; excludedLinks: ExcludedLinks; matching: DropOffMatching };

type EntriesByPickup = Map<string, PickupEntry[]>;
type PairedTrip = Trip & { pickup: TripPaper; dropOff: TripPaper };
type NamedDropOffEntry = PickupEntry & { dropoff_name: string; dropoff_match_key: string };
type ChosenEntries = { trip: Trip; excluded: PickupEntry[] };

export async function matchTripEntries(database: Database, reader: ReaderService | null, workspaceId: string, trips: Trip[]): Promise<TripEntries> {
  const pickupIds = trips.flatMap(({ pickup }) => pickup?.id ?? []);
  const unprinted = await listUnprintedPickupEntries(database, workspaceId, listTripPaperIds(trips));
  const printedEntries = (await listPickupEntries(database, workspaceId, pickupIds)).filter((entry) => !isUnprinted(unprinted, entry.document_id, entry.entry_id));
  const entriesByPickup = groupByPickup(printedEntries);
  const matching = await matchPairedTrips(database, reader, workspaceId, trips.filter(isPaired), entriesByPickup);
  logMatching(matching);
  const chosen = trips.map((trip) => chooseTripEntries(trip, entriesByPickup, matching));
  return { trips: chosen.map((entry) => entry.trip), excludedLinks: listExcludedLinks(chosen, listUnprintedLinks(trips, unprinted)), matching };
}

function listTripPaperIds(trips: Trip[]): { pickupId: string; dropOffId: string | null }[] {
  return trips.flatMap(({ pickup, dropOff }) => (pickup === null ? [] : [{ pickupId: pickup.id, dropOffId: dropOff?.id ?? null }]));
}

function isUnprinted(unprinted: UnprintedPickupEntry[], pickupId: string, entryId: string): boolean {
  return unprinted.some((entry) => entry.pickup_id === pickupId && entry.entry_id === entryId);
}

function listUnprintedLinks(trips: Trip[], unprinted: UnprintedPickupEntry[]): ExcludedLinks {
  const links = unprinted.flatMap(({ pickup_id: pickupId, entry_id: entryId }) => {
    const dropOffId = trips.find((trip) => trip.pickup?.id === pickupId)?.dropOff?.id;
    return [pickupId, ...(dropOffId === undefined ? [] : [dropOffId])].map((documentId) => ({ documentId, entryId }));
  });
  return { documentIds: links.map((link) => link.documentId), entryIds: links.map((link) => link.entryId) };
}

function groupByPickup(entries: PickupEntry[]): EntriesByPickup {
  const groups: EntriesByPickup = new Map();
  for (const entry of entries) groups.set(entry.document_id, [...(groups.get(entry.document_id) ?? []), entry]);
  return groups;
}

function isPaired(trip: Trip): trip is PairedTrip {
  return trip.pickup !== null && trip.dropOff !== null;
}

async function matchPairedTrips(database: Database, reader: ReaderService | null, workspaceId: string, paired: PairedTrip[], entriesByPickup: EntriesByPickup): Promise<DropOffMatching> {
  const names = listDropOffNames(paired, entriesByPickup);
  const receiverIds = [...new Set(paired.flatMap(({ dropOff }) => dropOff.receiver_id ?? []))];
  return matchDropOffNames(reader, names, await listReceivers(database, workspaceId, receiverIds));
}

function listDropOffNames(paired: PairedTrip[], entriesByPickup: EntriesByPickup): DropOffName[] {
  const entries = paired.flatMap(({ pickup }) => entriesByPickup.get(pickup.id) ?? []);
  const names = entries.filter(hasDropOff).map(({ dropoff_match_key: key, dropoff_name: name }) => ({ key, name }));
  return [...new Map(names.map((name) => [name.key, name])).values()];
}

function chooseTripEntries(trip: Trip, entriesByPickup: EntriesByPickup, matching: DropOffMatching): ChosenEntries {
  if (trip.pickup === null) return { trip, excluded: [] };
  const entries = entriesByPickup.get(trip.pickup.id) ?? [];
  const eligible = listEligibleEntries(entries, trip.dropOff?.receiver_id ?? null, matching);
  const routeEntry = eligible.find((entry) => entry.pickup_match_key !== null || entry.dropoff_match_key !== null);
  return { trip: { ...trip, pickup: applyRouteEntry(trip.pickup, routeEntry) }, excluded: entries.filter((entry) => !eligible.includes(entry)) };
}

function listEligibleEntries(entries: PickupEntry[], receiverId: string | null, matching: DropOffMatching): PickupEntry[] {
  if (receiverId !== null && matching.kind === 'ran') return entries.filter((entry) => !hasDropOff(entry) || meansReceiver(matching.matches, entry.dropoff_match_key, receiverId));
  return namesOneDropOff(entries) ? entries : entries.filter((entry) => !hasDropOff(entry));
}

function meansReceiver(matches: DropOffMatch[], key: string, receiverId: string): boolean {
  return matches.some((match) => match.key === key && match.receiverIds.includes(receiverId));
}

function namesOneDropOff(entries: PickupEntry[]): boolean {
  return entries.length > 0 && entries.every(hasDropOff) && new Set(entries.map((entry) => entry.dropoff_match_key)).size === 1;
}

function hasDropOff(entry: PickupEntry): entry is NamedDropOffEntry {
  return entry.dropoff_name !== null && entry.dropoff_match_key !== null;
}

function applyRouteEntry(pickup: TripPaper, entry: PickupEntry | undefined): TripPaper {
  return {
    ...pickup,
    route_pickup: entry?.pickup_name ?? null,
    route_pickup_key: entry?.pickup_match_key ?? null,
    route_dropoff: entry?.dropoff_name ?? null,
    route_customer: entry?.customer_name ?? null,
    route_entry_id: entry?.entry_id ?? null,
  };
}

function listExcludedLinks(chosen: ChosenEntries[], unprinted: ExcludedLinks): ExcludedLinks {
  const excluded = chosen.flatMap((choice) => choice.excluded);
  return { documentIds: [...excluded.map((entry) => entry.document_id), ...unprinted.documentIds], entryIds: [...excluded.map((entry) => entry.entry_id), ...unprinted.entryIds] };
}

function logMatching(matching: DropOffMatching): void {
  if (matching.kind === 'failed') console.log(`[trip-drop-off] failed reason=${matching.reason}`);
  if (matching.kind === 'ran') console.log(`[trip-drop-off] names=${matching.matches.length} matched=${matching.matches.filter((match) => match.receiverIds.length > 0).length}`);
}
