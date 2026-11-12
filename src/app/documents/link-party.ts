import type { Transaction } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import type { ReadingParty } from '../reading/reading.ts';
import { insertOrganization } from './insert-organization.ts';
import { insertRow } from './insert-row.ts';

export async function linkParty(transaction: Transaction, workspaceId: string, party: ReadingParty, matchKey: string): Promise<string> {
  const aliased = await findAliasedOrganization(transaction, workspaceId, matchKey);
  if (aliased) return aliased;
  const merged = await findOrganizationNamed(transaction, workspaceId, party);
  if (merged) return mergeIntoOrganization(transaction, workspaceId, merged, { printedName: party.printed_name, matchKey });
  return insertOrganization(transaction, workspaceId, { type: party.type, printedName: party.printed_name, matchKey });
}

async function findAliasedOrganization(transaction: Transaction, workspaceId: string, matchKey: string): Promise<string | null> {
  const [alias] = await transaction.query<{ organization_id: string }>(
    'SELECT organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = $2',
    [workspaceId, matchKey],
  );
  return alias?.organization_id ?? null;
}

async function findOrganizationNamed(transaction: Transaction, workspaceId: string, party: ReadingParty): Promise<string | null> {
  const knownName = party.known_name?.trim() ?? '';
  const wanted = toAccentFreeForm(knownName);
  if (wanted === null) return null;
  const organizations = await transaction.query<{ id: string; name: string }>(
    'SELECT id, name FROM organizations WHERE workspace_id = $1 AND type = $2 ORDER BY created_at, id',
    [workspaceId, party.type],
  );
  const exact = organizations.filter((organization) => organization.name.trim() === knownName);
  if (exact.length > 0) return pickOnlyOrganization(exact);
  return pickOnlyOrganization(organizations.filter((organization) => toAccentFreeForm(organization.name) === wanted));
}

function pickOnlyOrganization(candidates: { id: string }[]): string | null {
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}

async function mergeIntoOrganization(
  transaction: Transaction,
  workspaceId: string,
  organizationId: string,
  { printedName, matchKey }: { printedName: string; matchKey: string },
): Promise<string> {
  const merge = { workspace_id: workspaceId, organization_id: organizationId, printed_name: printedName.trim(), match_key: matchKey };
  await insertRow(transaction, 'organization_aliases', merge);
  await insertRow(transaction, 'merged_names', merge);
  return organizationId;
}
