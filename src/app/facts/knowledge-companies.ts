import type { Transaction } from '../db/transaction.ts';
import type { KnowledgeCompany, KnowledgeConditions } from './company-knowledge.ts';
import { FACT_COMPANY_SLOTS, type FactCompanySlot } from './pick-fact-companies.ts';

const INSERT_PICKS_SQL = `
  INSERT INTO company_knowledge_companies (workspace_id, entry_id, slot, organization_id)
  SELECT $1, $2, $3, organization.id FROM organizations organization WHERE organization.workspace_id = $1 AND organization.id = ANY($4::uuid[])
  ON CONFLICT DO NOTHING`;

export async function storeKnowledgeCompanies(transaction: Transaction, workspaceId: string, entryId: string, conditions: Pick<KnowledgeConditions, FactCompanySlot>): Promise<void> {
  for (const slot of FACT_COMPANY_SLOTS) await replaceSlotCompanies(transaction, workspaceId, entryId, slot, readPicks(conditions[slot]));
}

function readPicks(company: KnowledgeCompany | null): string[] | null {
  return company?.organizationIds ?? null;
}

export async function replaceSlotCompanies(transaction: Transaction, workspaceId: string, entryId: string, slot: FactCompanySlot, organizationIds: string[] | null): Promise<void> {
  await transaction.query('DELETE FROM company_knowledge_companies WHERE entry_id = $1 AND workspace_id = $2 AND slot = $3', [entryId, workspaceId, slot]);
  if (organizationIds !== null) await transaction.query(INSERT_PICKS_SQL, [workspaceId, entryId, slot, organizationIds]);
}
