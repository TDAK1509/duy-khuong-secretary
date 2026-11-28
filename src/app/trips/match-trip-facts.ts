import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { Database } from '../db/transaction.ts';
import type { Trip } from './build-trips.ts';
import { listPickupFacts, listUnprintedPickupFacts, type PickupFact, type UnprintedPickupFact } from './list-pickup-facts.ts';
import { listReceivers } from './list-receivers.ts';
import type { ExcludedLinks, TripPaper } from './list-trip-papers.ts';
import { matchDropOffNames, type DropOffMatch, type DropOffMatching, type DropOffName } from './match-drop-off-names.ts';

export type TripFacts = { trips: Trip[]; excludedLinks: ExcludedLinks; matching: DropOffMatching };

type FactsByPickup = Map<string, PickupFact[]>;
type PairedTrip = Trip & { pickup: TripPaper; dropOff: TripPaper };
type NamedDropOffFact = PickupFact & { dropoff_name: string; dropoff_match_key: string };
type ChosenFacts = { trip: Trip; excluded: PickupFact[] };

export async function matchTripFacts(database: Database, reader: ReaderService | null, workspaceId: string, trips: Trip[]): Promise<TripFacts> {
  const pickupIds = trips.flatMap(({ pickup }) => pickup?.id ?? []);
  const unprinted = await listUnprintedPickupFacts(database, workspaceId, listTripPaperIds(trips));
  const printedFacts = (await listPickupFacts(database, workspaceId, pickupIds)).filter((fact) => !isUnprinted(unprinted, fact.document_id, fact.fact_id));
  const factsByPickup = groupByPickup(printedFacts);
  const matching = await matchPairedTrips(database, reader, workspaceId, trips.filter(isPaired), factsByPickup);
  logMatching(matching);
  const chosen = trips.map((trip) => chooseTripFacts(trip, factsByPickup, matching));
  return { trips: chosen.map((entry) => entry.trip), excludedLinks: listExcludedLinks(chosen, listUnprintedLinks(trips, unprinted)), matching };
}

function listTripPaperIds(trips: Trip[]): { pickupId: string; dropOffId: string | null }[] {
  return trips.flatMap(({ pickup, dropOff }) => (pickup === null ? [] : [{ pickupId: pickup.id, dropOffId: dropOff?.id ?? null }]));
}

function isUnprinted(unprinted: UnprintedPickupFact[], pickupId: string, factId: string): boolean {
  return unprinted.some((entry) => entry.pickup_id === pickupId && entry.fact_id === factId);
}

function listUnprintedLinks(trips: Trip[], unprinted: UnprintedPickupFact[]): ExcludedLinks {
  const links = unprinted.flatMap(({ pickup_id: pickupId, fact_id: factId }) => {
    const dropOffId = trips.find((trip) => trip.pickup?.id === pickupId)?.dropOff?.id;
    return [pickupId, ...(dropOffId === undefined ? [] : [dropOffId])].map((documentId) => ({ documentId, factId }));
  });
  return { documentIds: links.map((link) => link.documentId), factIds: links.map((link) => link.factId) };
}

function groupByPickup(facts: PickupFact[]): FactsByPickup {
  const groups: FactsByPickup = new Map();
  for (const fact of facts) groups.set(fact.document_id, [...(groups.get(fact.document_id) ?? []), fact]);
  return groups;
}

function isPaired(trip: Trip): trip is PairedTrip {
  return trip.pickup !== null && trip.dropOff !== null;
}

async function matchPairedTrips(database: Database, reader: ReaderService | null, workspaceId: string, paired: PairedTrip[], factsByPickup: FactsByPickup): Promise<DropOffMatching> {
  const names = listDropOffNames(paired, factsByPickup);
  const receiverIds = [...new Set(paired.flatMap(({ dropOff }) => dropOff.receiver_id ?? []))];
  return matchDropOffNames(reader, names, await listReceivers(database, workspaceId, receiverIds));
}

function listDropOffNames(paired: PairedTrip[], factsByPickup: FactsByPickup): DropOffName[] {
  const facts = paired.flatMap(({ pickup }) => factsByPickup.get(pickup.id) ?? []);
  const names = facts.filter(hasDropOff).map(({ dropoff_match_key: key, dropoff_name: name }) => ({ key, name }));
  return [...new Map(names.map((name) => [name.key, name])).values()];
}

function chooseTripFacts(trip: Trip, factsByPickup: FactsByPickup, matching: DropOffMatching): ChosenFacts {
  if (trip.pickup === null) return { trip, excluded: [] };
  const facts = factsByPickup.get(trip.pickup.id) ?? [];
  const eligible = listEligibleFacts(facts, trip.dropOff?.receiver_id ?? null, matching);
  const routeFact = eligible.find((fact) => fact.pickup_match_key !== null || fact.dropoff_match_key !== null);
  return { trip: { ...trip, pickup: applyRouteFact(trip.pickup, routeFact) }, excluded: facts.filter((fact) => !eligible.includes(fact)) };
}

function listEligibleFacts(facts: PickupFact[], receiverId: string | null, matching: DropOffMatching): PickupFact[] {
  if (receiverId !== null && matching.kind === 'ran') return facts.filter((fact) => !hasDropOff(fact) || meansReceiver(matching.matches, fact.dropoff_match_key, receiverId));
  return namesOneDropOff(facts) ? facts : facts.filter((fact) => !hasDropOff(fact));
}

function meansReceiver(matches: DropOffMatch[], key: string, receiverId: string): boolean {
  return matches.some((match) => match.key === key && match.receiverIds.includes(receiverId));
}

function namesOneDropOff(facts: PickupFact[]): boolean {
  return facts.length > 0 && facts.every(hasDropOff) && new Set(facts.map((fact) => fact.dropoff_match_key)).size === 1;
}

function hasDropOff(fact: PickupFact): fact is NamedDropOffFact {
  return fact.dropoff_name !== null && fact.dropoff_match_key !== null;
}

function applyRouteFact(pickup: TripPaper, fact: PickupFact | undefined): TripPaper {
  return {
    ...pickup,
    route_pickup: fact?.pickup_name ?? null,
    route_pickup_key: fact?.pickup_match_key ?? null,
    route_dropoff: fact?.dropoff_name ?? null,
    route_customer: fact?.customer_name ?? null,
  };
}

function listExcludedLinks(chosen: ChosenFacts[], unprinted: ExcludedLinks): ExcludedLinks {
  const excluded = chosen.flatMap((entry) => entry.excluded);
  return { documentIds: [...excluded.map((fact) => fact.document_id), ...unprinted.documentIds], factIds: [...excluded.map((fact) => fact.fact_id), ...unprinted.factIds] };
}

function logMatching(matching: DropOffMatching): void {
  if (matching.kind === 'failed') console.log(`[trip-drop-off] failed reason=${matching.reason}`);
  if (matching.kind === 'ran') console.log(`[trip-drop-off] names=${matching.matches.length} matched=${matching.matches.filter((match) => match.receiverIds.length > 0).length}`);
}
