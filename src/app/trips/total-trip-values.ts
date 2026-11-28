import type { ReaderService } from '../../services/reading/reader-service.ts';
import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { DocumentFilters } from '../documents/add-document-filters.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere } from '../documents/build-document-where.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import { countNotRereadMessages } from '../documents/count-not-reread-messages.ts';
import { buildGroupSql, type DocumentGroup } from '../documents/document-groups.ts';
import { countReviewDocuments, type DocumentFactValueRow, type FactValueRequest, type FactValueTotals } from '../facts/total-fact-values.ts';
import { loadShownGoodsNames } from '../goods-names/show-goods-name.ts';
import { WhereClause } from '../records/where-clause.ts';
import { listWorkspaceRules } from '../workspace-rules/list-workspace-rules.ts';
import { buildTrips, type Trip } from './build-trips.ts';
import { listWinningValues, type ExcludedLinks, type WinningValue } from './list-trip-papers.ts';
import { addDays, loadTripPapers, MAX_TRIP_PAPERS } from './load-trip-papers.ts';
import { pairTrips } from './pair-trips.ts';
import { readWeightKg } from './read-trip-paper.ts';

type PassingPaper = { id: string; date: string | null };

type DateRange = { from: string; to: string };

type PaperGroups = Map<string, string | null>;

const NO_EXCLUDED_LINKS: ExcludedLinks = { documentIds: [], factIds: [] };

export async function totalTripValues(database: Database, scope: AccessScope, request: FactValueRequest, dropOffReader: ReaderService | null): Promise<FactValueTotals | null> {
  const rows = await listTripValueRows(database, scope.workspaceId, request, dropOffReader);
  if (rows === null) return null;
  return { documents: rows, reviewDocuments: await countReviewDocuments(database, scope, request), notRereadMessages: await countNotRereadMessages(database, scope) };
}

async function listTripValueRows(database: Database, workspaceId: string, request: FactValueRequest, dropOffReader: ReaderService | null): Promise<DocumentFactValueRow[] | null> {
  const passing = await listPassingPapers(database, workspaceId, request.filters);
  const range = readDateRange(passing);
  if (range === null) return [];
  const trips = await buildTripsInRange(database, workspaceId, { range, plate: request.filters.plate, dropOffReader });
  if (trips === null) return null;
  const passingIds = new Set(passing.map(({ id }) => id));
  return describeTrips(database, workspaceId, request, trips.filter((trip) => listTripPaperIds(trip).some((id) => passingIds.has(id))));
}

async function listPassingPapers(database: Database, workspaceId: string, filters: DocumentFilters): Promise<PassingPaper[]> {
  const where = buildDocumentWhere(workspaceId, filters, ACCEPTED_CONFIRMED);
  const { rows } = await database.query<PassingPaper>(
    `SELECT document.id::text AS id, to_char(document.document_date, 'YYYY-MM-DD') AS date FROM documents document WHERE ${where.toSql()}`,
    where.values,
  );
  return rows;
}

function readDateRange(papers: PassingPaper[]): DateRange | null {
  const dates = papers.flatMap(({ date }) => date ?? []).sort();
  const [from] = dates;
  const to = dates.at(-1);
  return from === undefined || to === undefined ? null : { from, to };
}

type TripSearch = { range: DateRange; plate: string | null; dropOffReader: ReaderService | null };

async function buildTripsInRange(database: Database, workspaceId: string, { range, plate, dropOffReader }: TripSearch): Promise<Trip[] | null> {
  const papers = await loadTripPapers(database, { workspaceId, dateFrom: range.from, dateTo: range.to, plate, limit: MAX_TRIP_PAPERS + 1 });
  if (papers === null) return null;
  const rules = await listWorkspaceRules(database, workspaceId);
  const pairing = await pairTrips(dropOffReader, papers, rules.map(({ rule }) => rule), await loadShownGoodsNames(database, workspaceId));
  return buildTrips({ ...papers, dateFrom: addDays(range.from, -1), dateTo: addDays(range.to, 1) }, pairing);
}

function listTripPaperIds({ pickup, dropOff }: Trip): string[] {
  return [pickup?.id ?? [], dropOff?.id ?? []].flat();
}

async function describeTrips(database: Database, workspaceId: string, request: FactValueRequest, trips: Trip[]): Promise<DocumentFactValueRow[]> {
  const paperIds = trips.flatMap(listTripPaperIds);
  const winners = await listWinningValues(database, workspaceId, paperIds, [buildMatchKey(request.valueName)], NO_EXCLUDED_LINKS);
  const groups = await listPaperGroups(database, workspaceId, request, paperIds);
  const winnerByPaper = new Map(winners.map((winner) => [winner.document_id, winner]));
  return trips.flatMap((trip) => describeTrip(trip, winnerByPaper.get((trip.pickup ?? trip.dropOff)?.id ?? ''), groups, request.groupBy));
}

function describeTrip(trip: Trip, winner: WinningValue | undefined, groups: PaperGroups, groupBy: DocumentGroup): DocumentFactValueRow[] {
  if (winner === undefined) return [];
  const weightKg = readWeightKg(trip.pickup) ?? readWeightKg(trip.dropOff);
  return [{ group: readTripGroup(trip, groups, groupBy), number: winner.number, unit: winner.unit, text: winner.text, weight_kg: weightKg === null ? null : String(weightKg) }];
}

function readTripGroup(trip: Trip, groups: PaperGroups, groupBy: DocumentGroup): string | null {
  const paperIds = groupBy === 'organization' ? listTripPaperIds(trip) : [(trip.pickup ?? trip.dropOff)?.id ?? ''];
  return paperIds.flatMap((id) => groups.get(id) ?? []).sort().at(0) ?? null;
}

async function listPaperGroups(database: Database, workspaceId: string, { groupBy, filters }: FactValueRequest, paperIds: string[]): Promise<PaperGroups> {
  if (paperIds.length === 0) return new Map();
  const where = new WhereClause();
  const groupSql = buildGroupSql(groupBy, where, filters);
  where.require(`document.workspace_id = ${where.bind(workspaceId)}`);
  where.require(`document.id = ANY(${where.bind(paperIds)}::uuid[])`);
  const { rows } = await database.query<{ id: string; group: string | null }>(
    `SELECT document.id::text AS id, ${groupSql} AS "group" FROM documents document WHERE ${where.toSql()}`,
    where.values,
  );
  return new Map(rows.map((row) => [row.id, row.group]));
}
