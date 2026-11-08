import type { Transaction } from '../db/transaction.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import type { ReadingParty } from '../reading/reading.ts';

export type PartyLink = { organization_id: string | null; proposed_organization_id: string | null };

export async function linkParty(transaction: Transaction, workspaceId: string, party: ReadingParty, matchKey: string): Promise<PartyLink | null> {
  const aliased = await findAliasedOrganization(transaction, workspaceId, matchKey);
  if (aliased) return { organization_id: aliased, proposed_organization_id: null };
  const proposed = await findOrganizationNamed(transaction, workspaceId, party.known_name);
  if (proposed) return { organization_id: null, proposed_organization_id: proposed };
  return null;
}

async function findAliasedOrganization(transaction: Transaction, workspaceId: string, matchKey: string): Promise<string | null> {
  const [alias] = await transaction.query<{ organization_id: string }>(
    'SELECT organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = $2',
    [workspaceId, matchKey],
  );
  return alias?.organization_id ?? null;
}

async function findOrganizationNamed(transaction: Transaction, workspaceId: string, knownName: string | null): Promise<string | null> {
  const wanted = toAccentFreeForm(knownName);
  if (wanted === null) return null;
  const organizations = await transaction.query<{ id: string; name: string }>(
    'SELECT id, name FROM organizations WHERE workspace_id = $1 ORDER BY created_at, id',
    [workspaceId],
  );
  return organizations.find((organization) => toAccentFreeForm(organization.name) === wanted)?.id ?? null;
}
