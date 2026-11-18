import type { Database } from '../db/transaction.ts';
import { buildWeightSql } from '../facts/total-fact-values.ts';
import { WhereClause } from '../records/where-clause.ts';
import { buildPreciseTimeSql } from './list-trip-papers.ts';

export type CandidateQuery = { workspaceId: string; plates: string[]; dateFrom: string; dateTo: string; reportPaperIds: string[] };

export type DropOffCandidate = {
  id: string;
  vehicle_plate: string;
  document_date: string;
  document_number: string | null;
  kind: string;
  receiver: string;
  weight_kg: string | null;
  precise_at: string | null;
};

export async function listDropOffCandidates(database: Database, query: CandidateQuery): Promise<DropOffCandidate[]> {
  if (query.plates.length === 0) return [];
  const where = new WhereClause();
  where.require(`document.workspace_id = ${where.bind(query.workspaceId)}`);
  where.require(`document.status = 'accepted' AND document.stage = 'receipt'`);
  where.require(`document.vehicle_plate = ANY(${where.bind(query.plates)}::text[])`);
  where.require(`document.document_date BETWEEN ${where.bind(query.dateFrom)}::date AND ${where.bind(query.dateTo)}::date + 1`);
  where.require(`NOT (document.id = ANY(${where.bind(query.reportPaperIds)}::uuid[]))`);
  const { rows } = await database.query<DropOffCandidate>(
    `SELECT document.id, document.vehicle_plate, to_char(document.document_date, 'YYYY-MM-DD') AS document_date, document.document_number, document.kind,
       receiver.name AS receiver, ${buildWeightSql(where)} AS weight_kg, ${buildPreciseTimeSql()} AS precise_at
     FROM documents document
     CROSS JOIN LATERAL (
       SELECT
         (SELECT array_agg(DISTINCT party.organization_id) FROM document_parties party WHERE party.document_id = document.id AND party.role = 'issuer') AS issuers,
         (SELECT party.organization_id FROM document_parties party WHERE party.document_id = document.id AND party.role = 'place' ORDER BY party.created_at, party.id LIMIT 1) AS place
     ) parties
     JOIN organizations receiver ON receiver.workspace_id = document.workspace_id
       AND receiver.id = CASE WHEN parties.issuers IS NULL THEN parties.place WHEN cardinality(parties.issuers) = 1 THEN parties.issuers[1] END
     WHERE ${where.toSql()}
     ORDER BY document.vehicle_plate, document.document_date, document.id`,
    where.values,
  );
  return rows;
}
