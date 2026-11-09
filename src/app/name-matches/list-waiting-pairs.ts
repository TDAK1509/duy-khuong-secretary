import type { Transaction } from '../db/transaction.ts';
import type { WaitingPair } from './build-name-proposal.ts';

type PairRow = { match_key: string; organization_id: string; organization_name: string; printed_name: string; document_count: number };

export function listWaitingPairs(transaction: Transaction, workspaceId: string): Promise<WaitingPair[]> {
  return transaction.withScope({ workspaceId }, () => queryWaitingPairs(transaction, workspaceId));
}

async function queryWaitingPairs(transaction: Transaction, workspaceId: string): Promise<WaitingPair[]> {
  const rows = await transaction.query<PairRow>(
    `SELECT party.match_key, party.proposed_organization_id AS organization_id, organization.name AS organization_name,
       min(party.printed_name) AS printed_name, count(DISTINCT party.document_id)::int AS document_count
     FROM document_parties party
     JOIN organizations organization
       ON organization.id = party.proposed_organization_id AND organization.workspace_id = party.workspace_id
     WHERE party.workspace_id = $1 AND party.proposed_organization_id IS NOT NULL
     GROUP BY party.match_key, party.proposed_organization_id, organization.name`,
    [workspaceId],
  );
  return rows.map((row) => ({
    matchKey: row.match_key,
    organizationId: row.organization_id,
    printedName: row.printed_name,
    organizationName: row.organization_name,
    documentCount: row.document_count,
  }));
}
