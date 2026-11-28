import type { Transaction } from '../db/transaction.ts';
import { GOODS_VALUE_KEY } from './fact.ts';
import type { FactCompanySlot } from './pick-fact-companies.ts';

const DRIVER_SENT_A_SOURCE = `EXISTS (
  SELECT 1 FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = document.id AND message.user_id = fact.driver_user_id
)`;

const IS_ROUTE_FACT = '(fact.pickup_match_key IS NOT NULL OR fact.dropoff_match_key IS NOT NULL)';

export const IS_TRIP_TICKET_SHAPE = `(
  (document.stage IN ('dispatch', 'receipt') OR (document.stage IS NULL AND strpos(${buildAccentFreeKey('document.kind')}, 'phieucan') > 0))
  AND ${buildAccentFreeKey('document.kind')} <> 'tinnhan'
  AND document.sheet_signature IS NULL
  AND NOT EXISTS (SELECT 1 FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL)
)`;

export const IS_TRIP_TICKET = `(document.status = 'accepted' AND ${IS_TRIP_TICKET_SHAPE})`;

const IS_LINKABLE_PAPER = `(document.status = 'accepted' AND ${buildAccentFreeKey('document.kind')} <> 'tinnhan' AND document.sheet_signature IS NULL)`;

const FACT_GOODS = `
  SELECT nullif(${buildAccentFreeKey('value.text_value')}, '') AS key,
    coalesce((SELECT array_agg(DISTINCT token) FROM ${splitGoodsTokens('value.text_value')} token WHERE token <> ''), '{}') AS tokens
  FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${GOODS_VALUE_KEY}'`;

const TOKEN_MATCHES_BY_PREFIX = '(wanted = token OR (length(wanted) >= 4 AND starts_with(token, wanted)) OR (length(token) >= 4 AND starts_with(wanted, token)))';

const PAPER_GOODS_TEXTS = `
  SELECT line.value AS text FROM document_lines line
  WHERE line.document_id = document.id AND line.item IS NULL AND ${buildAccentFreeKey('line.label')} = '${GOODS_VALUE_KEY}'
  UNION ALL
  SELECT line.item AS text FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL`;

const GOODS_MATCH = `(fact_goods.key IS NULL OR EXISTS (
  SELECT 1 FROM (${PAPER_GOODS_TEXTS}) goods WHERE ${buildAccentFreeKey('goods.text')} = fact_goods.key OR ${buildEveryTokenFound('fact_goods.tokens', 'goods.text')}
))`;

export const LINK_MATCHES_SQL = `
  INSERT INTO document_facts (workspace_id, document_id, fact_id)
  SELECT document.workspace_id, document.id, fact.id
  FROM facts fact
  LEFT JOIN LATERAL (${FACT_GOODS}) fact_goods ON true
  JOIN documents document ON document.workspace_id = fact.workspace_id
  WHERE fact.workspace_id = $1
    AND ($2::uuid IS NULL OR fact.id = $2)
    AND ($3::uuid[] IS NULL OR document.id = ANY($3::uuid[]))
    AND (NOT ${IS_ROUTE_FACT} OR ${IS_LINKABLE_PAPER})
    AND (fact.vehicle_plate IS NULL OR document.vehicle_plate = fact.vehicle_plate)
    AND (fact.driver_user_id IS NULL OR document.driver_user_id = fact.driver_user_id OR ${DRIVER_SENT_A_SOURCE})
    AND (fact.pickup_match_key IS NULL OR ${buildCompanyMatch('pickup')})
    AND (fact.dropoff_match_key IS NULL OR fact.pickup_match_key IS NOT NULL OR ${buildCompanyMatch('dropoff')})
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

function buildCompanyMatch(slot: FactCompanySlot): string {
  return `(CASE WHEN fact.${slot}_resolved THEN ${buildPickedMatch(slot)} ELSE ${buildPartyMatch(`${slot}_match_key`)} END)`;
}

function buildPickedMatch(slot: FactCompanySlot): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    JOIN fact_companies pick ON pick.fact_id = fact.id AND pick.slot = '${slot}' AND pick.organization_id = party.organization_id
    WHERE party.document_id = document.id
  )`;
}

function buildPartyMatch(matchKeyColumn: `${FactCompanySlot}_match_key`): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id
      AND (
        party.match_key = fact.${matchKeyColumn}
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = fact.${matchKeyColumn})
      )
  )`;
}

export function buildAccentFreeKey(column: string): string {
  return `regexp_replace(lower(unaccent(${column})), '[^a-z0-9]', '', 'g')`;
}

function splitGoodsTokens(column: string): string {
  return `regexp_split_to_table(lower(unaccent(${column})), '[^a-z0-9]+')`;
}

function buildEveryTokenFound(wantedTokens: string, text: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM unnest(${wantedTokens}) wanted
    WHERE NOT EXISTS (SELECT 1 FROM ${splitGoodsTokens(text)} token WHERE token <> '' AND ${TOKEN_MATCHES_BY_PREFIX})
  )`;
}
