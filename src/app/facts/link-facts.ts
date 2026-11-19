import type { Transaction } from '../db/transaction.ts';
import { GOODS_VALUE_KEY } from './fact.ts';
import type { CompanySlot } from './pick-fact-companies.ts';

const DRIVER_SENT_A_SOURCE = `EXISTS (
  SELECT 1 FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = document.id AND message.user_id = fact.driver_user_id
)`;

const ACCENT_FREE_KEY = (column: string) => `regexp_replace(lower(unaccent(${column})), '[^a-z0-9]', '', 'g')`;

const IS_ROUTE_FACT = '(fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL)';

const IS_TRIP_TICKET = `(
  document.status = 'accepted'
  AND (document.stage IN ('dispatch', 'receipt') OR (document.stage IS NULL AND strpos(${ACCENT_FREE_KEY('document.kind')}, 'phieucan') > 0))
  AND ${ACCENT_FREE_KEY('document.kind')} <> 'tinnhan'
  AND document.sheet_signature IS NULL
  AND NOT EXISTS (SELECT 1 FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL)
)`;

const PICKUP_ROLES = `(CASE document.stage WHEN 'receipt' THEN ARRAY['supplier'] ELSE ARRAY['issuer', 'place', 'supplier'] END)`;
const DROPOFF_ROLES = `(CASE document.stage WHEN 'dispatch' THEN ARRAY['customer', 'place'] WHEN 'receipt' THEN ARRAY['issuer', 'place'] ELSE ARRAY['issuer', 'customer', 'place'] END)`;
const CUSTOMER_ROLES = `ARRAY['customer']`;

const SPLIT_GOODS = (column: string) => `regexp_split_to_table(lower(unaccent(${column})), '[^a-z0-9]+')`;

const FACT_GOODS = `
  SELECT nullif(${ACCENT_FREE_KEY('value.text_value')}, '') AS key,
    (SELECT array_agg(DISTINCT token) FROM ${SPLIT_GOODS('value.text_value')} token WHERE token <> '') AS tokens
  FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${GOODS_VALUE_KEY}'`;

const GOODS_MATCH = `(fact_goods.key IS NULL OR EXISTS (
  SELECT 1 FROM document_lines line
  WHERE line.document_id = document.id AND line.item IS NULL AND ${ACCENT_FREE_KEY('line.label')} = '${GOODS_VALUE_KEY}'
    AND (${ACCENT_FREE_KEY('line.value')} = fact_goods.key OR EXISTS (
      SELECT 1 FROM ${SPLIT_GOODS('line.value')} token CROSS JOIN unnest(fact_goods.tokens) wanted
      WHERE token <> '' AND (wanted = token OR (length(wanted) >= 4 AND starts_with(token, wanted)) OR (length(token) >= 4 AND starts_with(wanted, token)))
    ))
))`;

const LINK_MATCHES_SQL = `
  INSERT INTO document_facts (workspace_id, document_id, fact_id)
  SELECT document.workspace_id, document.id, fact.id
  FROM facts fact
  LEFT JOIN LATERAL (${FACT_GOODS}) fact_goods ON true
  JOIN documents document ON document.workspace_id = fact.workspace_id
  WHERE fact.workspace_id = $1
    AND ($2::uuid IS NULL OR fact.id = $2)
    AND ($3::uuid[] IS NULL OR document.id = ANY($3::uuid[]))
    AND (NOT ${IS_ROUTE_FACT} OR ${IS_TRIP_TICKET})
    AND (fact.vehicle_plate IS NULL OR document.vehicle_plate = fact.vehicle_plate)
    AND (fact.driver_user_id IS NULL OR document.driver_user_id = fact.driver_user_id OR ${DRIVER_SENT_A_SOURCE})
    AND (fact.pickup_match_key IS NULL OR ${buildCompanyMatch('pickup', PICKUP_ROLES)})
    AND (fact.dropoff_match_key IS NULL OR fact.pickup_match_key IS NOT NULL OR ${buildCompanyMatch('dropoff', DROPOFF_ROLES)})
    AND (fact.customer_match_key IS NULL OR ${buildCompanyMatch('customer', CUSTOMER_ROLES)})
    AND ${GOODS_MATCH}
  ON CONFLICT DO NOTHING
  RETURNING document_id
`;

export async function linkFactToMatchingDocuments(transaction: Transaction, workspaceId: string, factId: string): Promise<number> {
  const rows = await transaction.query(LINK_MATCHES_SQL, [workspaceId, factId, null]);
  return rows.length;
}

export async function linkDocumentToMatchingFacts(transaction: Transaction, workspaceId: string, documentId: string): Promise<void> {
  await linkDocumentsToMatchingFacts(transaction, workspaceId, [documentId]);
}

export async function linkDocumentsToMatchingFacts(transaction: Transaction, workspaceId: string, documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;
  await transaction.query(LINK_MATCHES_SQL, [workspaceId, null, documentIds]);
}

function buildCompanyMatch(slot: CompanySlot, roles: string): string {
  return `(CASE WHEN fact.${slot}_resolved THEN ${buildPickedMatch(slot, roles)} ELSE ${buildPartyMatch(`${slot}_match_key`, roles)} END)`;
}

function buildPickedMatch(slot: CompanySlot, roles: string): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    JOIN fact_companies pick ON pick.fact_id = fact.id AND pick.slot = '${slot}' AND pick.organization_id = party.organization_id
    WHERE party.document_id = document.id AND party.role = ANY(${roles})
  )`;
}

function buildPartyMatch(matchKeyColumn: `${CompanySlot}_match_key`, roles: string): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id
      AND party.role = ANY(${roles})
      AND (
        party.match_key = fact.${matchKeyColumn}
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = fact.${matchKeyColumn})
      )
  )`;
}
