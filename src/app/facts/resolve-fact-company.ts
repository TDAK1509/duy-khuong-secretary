import type { Database } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';

export type CompanyResolution =
  | { kind: 'known'; matchKey: string; organizationName: string }
  | { kind: 'unknown' }
  | { kind: 'ambiguous'; organizationNames: string[] };

const FIND_SPELLINGS_SQL = `
  SELECT alias.organization_id, organization.name, alias.match_key
  FROM organization_aliases alias
  JOIN organizations organization ON organization.id = alias.organization_id
  WHERE alias.workspace_id = $1 AND strpos(alias.match_key, $2) > 0
  ORDER BY length(alias.match_key), alias.match_key
`;

type Spelling = { organization_id: string; name: string; match_key: string };

export async function resolveFactCompany(database: Database, workspaceId: string, matchKey: string): Promise<CompanyResolution> {
  const { rows } = await database.query<Spelling>(FIND_SPELLINGS_SQL, [workspaceId, matchKey]);
  const exact = rows.find((spelling) => spelling.match_key === matchKey);
  if (exact !== undefined) return toKnown(exact);
  const organizations = keepShortestSpellingPerOrganization(rows);
  const [first] = organizations;
  if (first === undefined) return { kind: 'unknown' };
  if (organizations.length === 1) return toKnown(first);
  const named = organizations.filter((spelling) => buildMatchKey(spelling.name) === matchKey);
  const [onlyNamed] = named;
  if (onlyNamed !== undefined && named.length === 1) return toKnown(onlyNamed);
  return { kind: 'ambiguous', organizationNames: organizations.map((spelling) => spelling.name) };
}

function toKnown(spelling: Spelling): CompanyResolution {
  return { kind: 'known', matchKey: spelling.match_key, organizationName: spelling.name };
}

function keepShortestSpellingPerOrganization(spellingsShortestFirst: Spelling[]): Spelling[] {
  const shortest = new Map<string, Spelling>();
  for (const spelling of spellingsShortestFirst) {
    if (!shortest.has(spelling.organization_id)) shortest.set(spelling.organization_id, spelling);
  }
  return [...shortest.values()];
}
