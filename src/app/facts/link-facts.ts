import type { Transaction } from '../db/transaction.ts';

const DRIVER_SENT_A_SOURCE = `EXISTS (
  SELECT 1 FROM document_sources source
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  WHERE source.document_id = document.id AND message.user_id = fact.driver_user_id
)`;

const LINK_MATCHES_SQL = `
  INSERT INTO document_facts (workspace_id, document_id, fact_id)
  SELECT document.workspace_id, document.id, fact.id
  FROM facts fact
  JOIN documents document ON document.workspace_id = fact.workspace_id
  WHERE fact.workspace_id = $1
    AND ($2::uuid IS NULL OR fact.id = $2)
    AND ($3::uuid IS NULL OR document.id = $3)
    AND (fact.vehicle_plate IS NULL OR document.vehicle_plate = fact.vehicle_plate)
    AND (fact.driver_user_id IS NULL OR document.driver_user_id = fact.driver_user_id OR ${DRIVER_SENT_A_SOURCE})
    AND (fact.pickup_match_key IS NULL OR ${buildPartyMatch('pickup_match_key')})
    AND (fact.dropoff_match_key IS NULL OR ${buildPartyMatch('dropoff_match_key')})
  ON CONFLICT DO NOTHING
  RETURNING document_id
`;

export async function linkFactToMatchingDocuments(transaction: Transaction, workspaceId: string, factId: string): Promise<number> {
  const rows = await transaction.query(LINK_MATCHES_SQL, [workspaceId, factId, null]);
  return rows.length;
}

export async function linkDocumentToMatchingFacts(transaction: Transaction, workspaceId: string, documentId: string): Promise<void> {
  await transaction.query(LINK_MATCHES_SQL, [workspaceId, null, documentId]);
}

function buildPartyMatch(matchKeyColumn: 'pickup_match_key' | 'dropoff_match_key'): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party
    WHERE party.document_id = document.id
      AND (
        party.match_key = fact.${matchKeyColumn}
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = party.organization_id AND alias.match_key = fact.${matchKeyColumn})
      )
  )`;
}
