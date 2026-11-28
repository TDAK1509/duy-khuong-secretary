import type { Transaction } from '../db/transaction.ts';
import { IS_TRIP_TICKET } from '../facts/link-facts.ts';
import { buildWeightSql } from '../facts/fact-value-totals.ts';
import { WhereClause } from '../records/where-clause.ts';
import { describeTripTicket, type TripTicket } from './describe-trip-ticket.ts';
import type { DocumentDraft } from './document-draft.ts';

export type AcceptedDocument = { id: string; vehicle_plate: string | null };

const FIND_NUMBERED_SQL = `
  SELECT id, vehicle_plate FROM documents
  WHERE workspace_id = $1 AND status = 'accepted' AND issuer_key = $2 AND document_number = $3
    AND document_date IS NOT DISTINCT FROM $4::date
  ORDER BY created_at, id`;

export async function findAcceptedDocuments(transaction: Transaction, workspaceId: string, draft: DocumentDraft): Promise<AcceptedDocument[]> {
  const numbered = await findNumberedDocuments(transaction, workspaceId, draft);
  if (numbered.length > 0) return numbered;
  const ticket = describeTripTicket(draft);
  return ticket === null ? [] : findRepeatedTripTickets(transaction, workspaceId, ticket);
}

async function findNumberedDocuments(transaction: Transaction, workspaceId: string, draft: DocumentDraft): Promise<AcceptedDocument[]> {
  if (draft.issuerKey === null || draft.documentNumber === null) return [];
  const values = [workspaceId, draft.issuerKey, draft.documentNumber, draft.documentDate];
  return transaction.query<AcceptedDocument>(FIND_NUMBERED_SQL, values);
}

async function findRepeatedTripTickets(transaction: Transaction, workspaceId: string, ticket: TripTicket): Promise<AcceptedDocument[]> {
  const where = buildRepeatedTripTicketWhere(workspaceId, ticket);
  return transaction.query<AcceptedDocument>(
    `SELECT document.id, document.vehicle_plate FROM documents document WHERE ${where.toSql()} ORDER BY document.created_at, document.id`,
    where.values,
  );
}

function buildRepeatedTripTicketWhere(workspaceId: string, ticket: TripTicket): WhereClause {
  const where = new WhereClause();
  where.require(`document.workspace_id = ${where.bind(workspaceId)}`);
  where.require(IS_TRIP_TICKET);
  where.require(`document.document_date = ${where.bind(ticket.date)}::date`);
  where.require(`document.vehicle_plate = ${where.bind(ticket.plate)}`);
  where.require(`(document.stage IS NOT DISTINCT FROM 'receipt') =${where.bind(ticket.isReceipt)}`);
  where.require(`${buildWeightSql(where)}::numeric = ${where.bind(ticket.netKilograms)}::numeric`);
  where.require(buildSharesPrintedTime(where.bind(ticket.printedTimes)));
  return where;
}

function buildSharesPrintedTime(printedTimesParameter: string): string {
  const times = `${printedTimesParameter}::timestamp[]`;
  const hasTimes = `SELECT 1 FROM document_lines line WHERE line.document_id = document.id AND line.at::time <> TIME '00:00:00'`;
  return `(cardinality(${times}) = 0
    OR NOT EXISTS (${hasTimes})
    OR EXISTS (${hasTimes} AND line.at = ANY(${times})))`;
}
