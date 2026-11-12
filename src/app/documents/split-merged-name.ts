import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { buildMatchKey } from './build-match-key.ts';
import { insertOrganization } from './insert-organization.ts';

export type MergedNameSplit = { documents: number } | null;

type MergedName = { organization_id: string; printed_name: string; match_key: string; type: string };

export function splitMergedName(database: Database, workspaceId: string, printedName: string): Promise<MergedNameSplit> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, workspaceId);
    const merged = await findMergedName(transaction, workspaceId, buildMatchKey(printedName));
    if (!merged) return null;
    await transaction.query('DELETE FROM organization_aliases WHERE workspace_id = $1 AND match_key = $2', [workspaceId, merged.match_key]);
    const organizationId = await insertOrganization(transaction, workspaceId, { type: merged.type, printedName: merged.printed_name, matchKey: merged.match_key });
    return { documents: await movePartiesToOrganization(transaction, merged, organizationId) };
  });
}

async function movePartiesToOrganization(transaction: Transaction, merged: MergedName, organizationId: string): Promise<number> {
  const moved = await transaction.query<{ document_id: string }>(
    'UPDATE document_parties SET organization_id = $1 WHERE organization_id = $2 AND match_key = $3 RETURNING document_id',
    [organizationId, merged.organization_id, merged.match_key],
  );
  return new Set(moved.map((party) => party.document_id)).size;
}

async function findMergedName(transaction: Transaction, workspaceId: string, matchKey: string): Promise<MergedName | null> {
  const [merged] = await transaction.query<MergedName>(
    `SELECT merged.organization_id, merged.printed_name, merged.match_key, organization.type
     FROM merged_names merged JOIN organizations organization ON organization.id = merged.organization_id
     WHERE merged.workspace_id = $1 AND merged.match_key = $2`,
    [workspaceId, matchKey],
  );
  return merged ?? null;
}
