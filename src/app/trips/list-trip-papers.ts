import type { Database } from '../db/transaction.ts';
import { buildSenderSubquery } from '../admin-chat/tools/export-documents-xlsx-tool.ts';
import { ACCEPTED_CONFIRMED, buildDocumentWhere, type DocumentRule } from '../documents/build-document-where.ts';
import type { DocumentFilters } from '../documents/add-document-filters.ts';
import { buildOutcomeRowsSql } from '../facts/knowledge-outcomes.ts';
import { buildWeightSql } from '../facts/knowledge-totals.ts';
import { buildCompanyMatch, GOODS_LABEL_KEY, IS_TRIP_TICKET, IS_TRIP_TICKET_SHAPE } from '../facts/link-facts.ts';
import type { WhereClause } from '../records/where-clause.ts';
import { IS_ROUTE_ENTRY_SQL, ROUTE_DROPOFF_NAME_SQL } from './route-dropoff.ts';

export type TripPaperQuery = { workspaceId: string; dateFrom: string; dateTo: string; plate: string | null; limit: number };

export type TripPaper = {
  id: string;
  document_date: string | null;
  vehicle_plate: string | null;
  document_number: string | null;
  kind: string;
  stage: string | null;
  route_pickup: string | null;
  route_dropoff: string | null;
  route_customer: string | null;
  route_pickup_key: string | null;
  goods_line: string | null;
  note_line: string | null;
  receiver_id: string | null;
  receiver_name: string | null;
  issuer_name: string | null;
  issuer_company_id: string | null;
  customer_party: string | null;
  weight_kg: string | null;
  sender_name: string | null;
  precise_at: string | null;
  printed_times: string[];
};

export type WinningValue = { document_id: string; match_key: string; number: string | null; unit: string | null; text: string | null };

const ROUTE_ENTRY_JOIN = `LEFT JOIN LATERAL (
    SELECT entry.id, entry.when_pickup_name AS pickup_name, ${ROUTE_DROPOFF_NAME_SQL} AS dropoff_name, entry.then_customer AS customer_name, entry.when_pickup_match_key AS pickup_match_key
    FROM company_knowledge_links link JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
    WHERE link.document_id = document.id AND ${IS_ROUTE_ENTRY_SQL}
    ORDER BY entry.updated_at DESC, entry.id DESC
    LIMIT 1
  ) route ON true`;

const IS_TRIP_PAPER = `(document.stage = 'dispatch' OR ${IS_TRIP_TICKET_SHAPE})`;

const IS_ISSUED_BY_PICKUP_COMPANY = `EXISTS (
  SELECT 1 FROM company_knowledge_links link JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
  WHERE link.document_id = document.id AND entry.when_pickup_match_key IS NOT NULL AND ${buildCompanyMatch('pickup', 'issuer')}
)`;

export type ReceiptPaperQuery = { workspaceId: string; dateFrom: string; dateTo: string; plate: string | null; limit: number };

export async function listTripPapers(database: Database, query: TripPaperQuery): Promise<TripPaper[]> {
  const where = buildTripWhere(query, ACCEPTED_CONFIRMED);
  where.require(`${IS_TRIP_PAPER} AND (document.stage IS DISTINCT FROM 'receipt' OR ${IS_ISSUED_BY_PICKUP_COMPANY})`);
  return selectPapers(database, where, { withReceiver: false, limit: query.limit });
}

export async function listReceiptPapers(database: Database, query: ReceiptPaperQuery): Promise<TripPaper[]> {
  const where = buildTripWhere(query, ACCEPTED_CONFIRMED);
  where.require(`document.stage = 'receipt' AND ${IS_TRIP_TICKET} AND NOT ${IS_ISSUED_BY_PICKUP_COMPANY}`);
  return selectPapers(database, where, { withReceiver: true, limit: query.limit });
}

async function selectPapers(database: Database, where: WhereClause, { withReceiver, limit }: { withReceiver: boolean; limit: number }): Promise<TripPaper[]> {
  const { rows } = await database.query<TripPaper>(
    `SELECT document.id, to_char(document.document_date, 'YYYY-MM-DD') AS document_date, document.vehicle_plate, document.document_number, document.kind, document.stage,
       route.pickup_name AS route_pickup, route.dropoff_name AS route_dropoff, route.customer_name AS route_customer,
       route.pickup_match_key AS route_pickup_key,
       issuer.printed_name AS issuer_name, issuer.company_id AS issuer_company_id,
       customer.printed_name AS customer_party,
       ${buildWeightSql(where)} AS weight_kg,
       ${buildSenderSubquery()} AS sender_name,
       ${buildPreciseTimeSql()} AS precise_at,
       ${buildPrintedTimesSql()} AS printed_times,
       ${GOODS_LINE_SQL} AS goods_line,
       ${NOTE_LINE_SQL} AS note_line,
       ${withReceiver ? RECEIVER_COLUMNS : NO_RECEIVER_COLUMNS}
     FROM documents document
     ${ROUTE_ENTRY_JOIN}
     ${buildFirstPartyJoin('issuer')}
     ${buildFirstPartyJoin('customer')}
     ${withReceiver ? RECEIVER_JOIN : ''}
     WHERE ${where.toSql()}
     ORDER BY document.document_date NULLS LAST, document.vehicle_plate NULLS LAST, document.created_at, document.id
     LIMIT ${where.bind(limit)}`,
    where.values,
  );
  return rows;
}

const NOTE_LABEL_KEY = 'ghichu';

const GOODS_LINE_SQL = buildLabelledLineSql(GOODS_LABEL_KEY);

const NOTE_LINE_SQL = buildLabelledLineSql(NOTE_LABEL_KEY);

function buildLabelledLineSql(labelKey: string): string {
  return `(SELECT line.value FROM document_lines line WHERE line.document_id = document.id AND line.item IS NULL
  AND regexp_replace(lower(unaccent(line.label)), '[^a-z0-9]', '', 'g') = '${labelKey}' ORDER BY line.line_no LIMIT 1)`;
}

const RECEIVER_JOIN = `LEFT JOIN LATERAL (
    SELECT organization.id, organization.name FROM (
      SELECT
        (SELECT array_agg(DISTINCT party.organization_id) FROM document_parties party WHERE party.document_id = document.id AND party.role = 'issuer') AS issuers,
        (SELECT party.organization_id FROM document_parties party WHERE party.document_id = document.id AND party.role = 'place' ORDER BY party.created_at, party.id LIMIT 1) AS place
    ) parties
    JOIN organizations organization ON organization.workspace_id = document.workspace_id
      AND organization.id = CASE WHEN parties.issuers IS NULL THEN parties.place WHEN cardinality(parties.issuers) = 1 THEN parties.issuers[1] END
  ) receiver ON true`;

const RECEIVER_COLUMNS = `receiver.id AS receiver_id, receiver.name AS receiver_name`;

const NO_RECEIVER_COLUMNS = `NULL::text AS receiver_id, NULL::text AS receiver_name`;

export async function countReviewTripPapers(database: Database, query: TripPaperQuery): Promise<number> {
  const where = buildTripWhere(query, { status: 'needs_review' });
  const { rows } = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM documents document WHERE ${where.toSql()} AND ${IS_TRIP_PAPER}`,
    where.values,
  );
  return rows[0]?.count ?? 0;
}

export type ExcludedLinks = { documentIds: string[]; entryIds: string[] };

const WINNING_VALUES_SQL = `
  SELECT DISTINCT ON (link.document_id, outcome.match_key)
    link.document_id, outcome.match_key, outcome.number::text AS number, outcome.unit, outcome.text_value AS text
  FROM company_knowledge_links link
  JOIN company_knowledge_entries entry ON entry.id = link.entry_id AND entry.workspace_id = link.workspace_id
  CROSS JOIN LATERAL (${buildOutcomeRowsSql('entry')}) outcome
  WHERE link.workspace_id = $1 AND link.document_id = ANY($2::uuid[]) AND outcome.match_key = ANY($3::text[])
    AND NOT EXISTS (SELECT 1 FROM unnest($4::uuid[], $5::uuid[]) AS excluded(document_id, entry_id) WHERE excluded.document_id = link.document_id AND excluded.entry_id = link.entry_id)
  ORDER BY link.document_id, outcome.match_key, entry.updated_at DESC, entry.id DESC`;

export async function listWinningValues(database: Database, workspaceId: string, documentIds: string[], matchKeys: string[], excluded: ExcludedLinks): Promise<WinningValue[]> {
  if (documentIds.length === 0 || matchKeys.length === 0) return [];
  const { rows } = await database.query<WinningValue>(WINNING_VALUES_SQL, [workspaceId, documentIds, matchKeys, excluded.documentIds, excluded.entryIds]);
  return rows;
}

export function buildPreciseTimeSql(): string {
  return `(SELECT to_char(min(line.at), 'YYYY-MM-DD"T"HH24:MI') FROM document_lines line
     WHERE line.document_id = document.id AND line.at IS NOT NULL AND line.at::time <> '00:00')`;
}

function buildPrintedTimesSql(): string {
  return `ARRAY(SELECT DISTINCT to_char(line.at, 'YYYY-MM-DD"T"HH24:MI:SS') FROM document_lines line
     WHERE line.document_id = document.id AND line.at IS NOT NULL AND line.at::time <> '00:00')`;
}

function buildTripWhere(query: TripPaperQuery, rule: DocumentRule): WhereClause {
  const filters: DocumentFilters = { organization: null, role: null, stage: null, kind: null, plate: query.plate, dateFrom: query.dateFrom, dateTo: query.dateTo, dateMeaning: null, template: null };
  return buildDocumentWhere(query.workspaceId, filters, rule);
}

function buildFirstPartyJoin(role: 'issuer' | 'customer'): string {
  return `LEFT JOIN LATERAL (
       SELECT party.printed_name, party.match_key, party.organization_id AS company_id FROM document_parties party
       WHERE party.document_id = document.id AND party.role = '${role}' ORDER BY party.created_at, party.id LIMIT 1
     ) ${role} ON true`;
}
