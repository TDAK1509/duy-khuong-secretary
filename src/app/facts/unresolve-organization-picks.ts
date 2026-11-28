import type { Transaction } from '../db/transaction.ts';
import { relinkEntryToMatchingDocuments } from './link-facts.ts';
import type { FactCompanySlot } from './pick-fact-companies.ts';

export async function unresolveOrganizationPicks(transaction: Transaction, workspaceId: string, organizationId: string): Promise<string[]> {
  const picks = await transaction.query<{ entry_id: string; slot: FactCompanySlot }>(
    'SELECT DISTINCT entry_id, slot FROM company_knowledge_companies WHERE workspace_id = $1 AND organization_id = $2',
    [workspaceId, organizationId],
  );
  for (const { entry_id: entryId, slot } of picks) await unresolveSlot(transaction, workspaceId, entryId, slot);
  const entryIds = [...new Set(picks.map((pick) => pick.entry_id))];
  for (const entryId of entryIds) await relinkEntryToMatchingDocuments(transaction, workspaceId, entryId);
  return entryIds;
}

async function unresolveSlot(transaction: Transaction, workspaceId: string, entryId: string, slot: FactCompanySlot): Promise<void> {
  await transaction.query('DELETE FROM company_knowledge_companies WHERE entry_id = $1 AND workspace_id = $2 AND slot = $3', [entryId, workspaceId, slot]);
  await transaction.query(`UPDATE company_knowledge_entries SET when_${slot}_resolved = false WHERE id = $1 AND workspace_id = $2`, [entryId, workspaceId]);
}
