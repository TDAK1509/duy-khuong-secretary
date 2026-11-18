import type { Transaction } from '../db/transaction.ts';
import type { FactCompany, FactScope } from './fact.ts';
import type { CompanySlot } from './pick-fact-companies.ts';

const INSERT_PICKS_SQL = `
  INSERT INTO fact_companies (workspace_id, fact_id, slot, organization_id)
  SELECT $1, $2, $3, organization.id FROM organizations organization WHERE organization.workspace_id = $1 AND organization.id = ANY($4::uuid[])
  ON CONFLICT DO NOTHING`;

export async function storeFactCompanies(transaction: Transaction, workspaceId: string, factId: string, scope: Pick<FactScope, CompanySlot>): Promise<void> {
  for (const slot of ['pickup', 'dropoff', 'customer'] as const) await replaceSlotCompanies(transaction, workspaceId, factId, slot, readPicks(scope[slot]));
}

function readPicks(company: FactCompany | null): string[] | null {
  return company?.organizationIds ?? null;
}

export async function replaceSlotCompanies(transaction: Transaction, workspaceId: string, factId: string, slot: CompanySlot, organizationIds: string[] | null): Promise<void> {
  await transaction.query('DELETE FROM fact_companies WHERE fact_id = $1 AND workspace_id = $2 AND slot = $3', [factId, workspaceId, slot]);
  if (organizationIds !== null) await transaction.query(INSERT_PICKS_SQL, [workspaceId, factId, slot, organizationIds]);
}
