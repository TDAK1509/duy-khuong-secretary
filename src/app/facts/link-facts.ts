import type { Transaction } from '../db/transaction.ts';
import type { FactCompanySlot } from './pick-fact-companies.ts';

export const GOODS_LABEL_KEY = 'hanghoa';

const DRIVER_SENT_A_SOURCE = `EXISTS (
  SELECT 1 FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = document.id AND message.user_id = entry.when_driver_user_id
)`;

const HAS_CONDITION = `(entry.when_goods IS NOT NULL OR entry.when_vehicle_plate IS NOT NULL OR entry.when_driver_user_id IS NOT NULL OR entry.when_pickup_match_key IS NOT NULL OR entry.when_dropoff_match_key IS NOT NULL)`;

const IS_ROUTE_ENTRY = '(entry.when_pickup_match_key IS NOT NULL OR entry.when_dropoff_match_key IS NOT NULL)';

export const IS_TRIP_TICKET_SHAPE = `(
  (document.stage IN ('dispatch', 'receipt') OR (document.stage IS NULL AND strpos(${buildAccentFreeKey('document.kind')}, 'phieucan') > 0))
  AND ${buildAccentFreeKey('document.kind')} <> 'tinnhan'
  AND document.sheet_signature IS NULL
  AND NOT EXISTS (SELECT 1 FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL)
)`;

export const IS_TRIP_TICKET = `(document.status = 'accepted' AND ${IS_TRIP_TICKET_SHAPE})`;

const IS_LINKABLE_PAPER = `(document.status = 'accepted' AND ${buildAccentFreeKey('document.kind')} <> 'tinnhan' AND document.sheet_signature IS NULL)`;

const ENTRY_GOODS = `
  SELECT nullif(${buildAccentFreeKey('entry.when_goods')}, '') AS key,
    coalesce((SELECT array_agg(DISTINCT token) FROM ${splitGoodsTokens('entry.when_goods')} token WHERE token <> ''), '{}') AS tokens`;

const TOKEN_MATCHES_BY_PREFIX = '(wanted = token OR (length(wanted) >= 4 AND starts_with(token, wanted)) OR (length(token) >= 4 AND starts_with(wanted, token)))';

const PAPER_GOODS_TEXTS = `
  SELECT line.value AS text FROM document_lines line
  WHERE line.document_id = document.id AND line.item IS NULL AND ${buildAccentFreeKey('line.label')} = '${GOODS_LABEL_KEY}'
  UNION ALL
  SELECT line.item AS text FROM document_lines line WHERE line.document_id = document.id AND line.item IS NOT NULL`;

const GOODS_MATCH = `(entry_goods.key IS NULL OR EXISTS (
  SELECT 1 FROM (${PAPER_GOODS_TEXTS}) goods WHERE ${buildAccentFreeKey('goods.text')} = entry_goods.key OR ${buildEveryTokenFound('entry_goods.tokens', 'goods.text')}
))`;

export const LINK_MATCHES_SQL = `
  INSERT INTO company_knowledge_links (workspace_id, document_id, entry_id)
  SELECT document.workspace_id, document.id, entry.id
  FROM company_knowledge_entries entry
  LEFT JOIN LATERAL (${ENTRY_GOODS}) entry_goods ON true
  JOIN documents document ON document.workspace_id = entry.workspace_id
  WHERE entry.workspace_id = $1
    AND ($2::uuid IS NULL OR entry.id = $2)
    AND ($3::uuid[] IS NULL OR document.id = ANY($3::uuid[]))
    AND ${HAS_CONDITION}
    AND (NOT ${IS_ROUTE_ENTRY} OR ${IS_LINKABLE_PAPER})
    AND (entry.when_vehicle_plate IS NULL OR document.vehicle_plate = entry.when_vehicle_plate)
    AND (entry.when_driver_user_id IS NULL OR document.driver_user_id = entry.when_driver_user_id OR ${DRIVER_SENT_A_SOURCE})
    AND (
      (entry.when_pickup_match_key IS NULL AND entry.when_dropoff_match_key IS NULL)
      OR (entry.when_pickup_match_key IS NOT NULL AND ${buildCompanyMatch('pickup')})
      OR (entry.when_dropoff_match_key IS NOT NULL AND ${buildCompanyMatch('dropoff')})
    )
    AND ${GOODS_MATCH}
  ON CONFLICT DO NOTHING
  RETURNING document_id
`;

export async function relinkEntryToMatchingDocuments(transaction: Transaction, workspaceId: string, entryId: string): Promise<number> {
  await transaction.query('DELETE FROM company_knowledge_links WHERE entry_id = $1 AND workspace_id = $2', [entryId, workspaceId]);
  return linkEntryToMatchingDocuments(transaction, workspaceId, entryId);
}

export async function linkEntryToMatchingDocuments(transaction: Transaction, workspaceId: string, entryId: string): Promise<number> {
  const rows = await transaction.query(LINK_MATCHES_SQL, [workspaceId, entryId, null]);
  return rows.length;
}

export async function countLinkedDocuments(transaction: Transaction, workspaceId: string, entryId: string): Promise<number> {
  const [row] = await transaction.query<{ count: number }>('SELECT count(*)::int AS count FROM company_knowledge_links WHERE entry_id = $1 AND workspace_id = $2', [entryId, workspaceId]);
  return row?.count ?? 0;
}

export async function linkDocumentToMatchingEntries(transaction: Transaction, workspaceId: string, documentId: string): Promise<void> {
  await linkDocumentsToMatchingEntries(transaction, workspaceId, [documentId]);
}

export async function linkDocumentsToMatchingEntries(transaction: Transaction, workspaceId: string, documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;
  await transaction.query(LINK_MATCHES_SQL, [workspaceId, null, documentIds]);
}

export function buildCompanyMatch(slot: FactCompanySlot, partyRole: string | null = null): string {
  const partyFilter = partyRole === null ? '' : `AND party.role = '${partyRole}'`;
  return `(CASE WHEN entry.when_${slot}_resolved THEN ${buildPickedMatch(slot, partyFilter)} ELSE ${buildPartyMatch(`when_${slot}_match_key`, partyFilter)} END)`;
}

function buildPickedMatch(slot: FactCompanySlot, partyFilter: string): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    JOIN company_knowledge_companies pick ON pick.entry_id = entry.id AND pick.slot = '${slot}' AND pick.organization_id = party.organization_id
    WHERE party.document_id = document.id ${partyFilter}
  )`;
}

function buildPartyMatch(matchKeyColumn: `when_${FactCompanySlot}_match_key`, partyFilter: string): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id ${partyFilter}
      AND (
        party.match_key = entry.${matchKeyColumn}
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = entry.${matchKeyColumn})
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
