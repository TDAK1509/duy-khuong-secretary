import type { Database } from '../db/transaction.ts';

export type CompanyResolution =
  | { kind: 'known'; matchKey: string }
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
  if (rows.some((spelling) => spelling.match_key === matchKey)) return { kind: 'known', matchKey };
  const organizations = new Map(rows.map((spelling) => [spelling.organization_id, spelling.name]));
  const [first] = rows;
  if (first === undefined) return { kind: 'unknown' };
  if (organizations.size === 1) return { kind: 'known', matchKey: first.match_key };
  return { kind: 'ambiguous', organizationNames: [...organizations.values()] };
}
