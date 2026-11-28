import type { Transaction } from '../db/transaction.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import type { FactCompanySlot } from './pick-fact-companies.ts';

const RESOLVED_COLUMNS: Record<FactCompanySlot, string> = { pickup: 'pickup_resolved', dropoff: 'dropoff_resolved' };

export async function unresolveOrganizationPicks(transaction: Transaction, workspaceId: string, organizationId: string): Promise<string[]> {
  const picks = await transaction.query<{ fact_id: string; slot: FactCompanySlot }>(
    'SELECT DISTINCT fact_id, slot FROM fact_companies WHERE workspace_id = $1 AND organization_id = $2',
    [workspaceId, organizationId],
  );
  for (const { fact_id: factId, slot } of picks) await unresolveSlot(transaction, workspaceId, factId, slot);
  const factIds = [...new Set(picks.map((pick) => pick.fact_id))];
  for (const factId of factIds) await relinkFact(transaction, workspaceId, factId);
  return factIds;
}

async function unresolveSlot(transaction: Transaction, workspaceId: string, factId: string, slot: FactCompanySlot): Promise<void> {
  await transaction.query('DELETE FROM fact_companies WHERE fact_id = $1 AND workspace_id = $2 AND slot = $3', [factId, workspaceId, slot]);
  await transaction.query(`UPDATE facts SET ${RESOLVED_COLUMNS[slot]} = false WHERE id = $1 AND workspace_id = $2`, [factId, workspaceId]);
}

async function relinkFact(transaction: Transaction, workspaceId: string, factId: string): Promise<void> {
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  await linkFactToMatchingDocuments(transaction, workspaceId, factId);
}
