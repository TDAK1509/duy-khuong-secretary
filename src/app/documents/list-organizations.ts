import type { Database } from '../db/transaction.ts';
import { buildMatchKey } from './build-match-key.ts';

export type ListedOrganization = { name: string; type: string; aliases: string[]; document_count: number };

type OrganizationRow = ListedOrganization & { match_keys: string[] };

const SELECT_ORGANIZATIONS = `SELECT organization.name, organization.type,
    array_agg(alias.printed_name ORDER BY alias.created_at, alias.id) AS aliases,
    array_agg(alias.match_key) AS match_keys,
    (SELECT count(DISTINCT party.document_id)::int FROM document_parties party WHERE party.organization_id = organization.id) AS document_count
  FROM organizations organization
  JOIN organization_aliases alias ON alias.organization_id = organization.id
  GROUP BY organization.id
  ORDER BY organization.name, organization.id`;

export async function listOrganizations(database: Database, text: string | null): Promise<ListedOrganization[]> {
  const { rows } = await database.query<OrganizationRow>(SELECT_ORGANIZATIONS);
  const textKey = buildMatchKey(text ?? '');
  return rows.filter((row) => matchesText(row, textKey)).map(({ name, type, aliases, document_count }) => ({ name, type, aliases, document_count }));
}

function matchesText(row: OrganizationRow, textKey: string): boolean {
  if (textKey === '') return true;
  return [buildMatchKey(row.name), ...row.match_keys].some((key) => key.includes(textKey));
}
