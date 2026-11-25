import type { Database } from '../../db/transaction.ts';
import { readCompanyArgument } from './fact-company-argument.ts';

export type TemplateIssuer = { organizationId: string | null; matchedName: string | null };

const NO_ISSUER: TemplateIssuer = { organizationId: null, matchedName: null };

const FIND_ORGANIZATION_SQL = 'SELECT organization_id FROM organization_aliases WHERE workspace_id = $1 AND match_key = $2';

export async function resolveTemplateIssuer(database: Database, workspaceId: string, raw: string | null): Promise<TemplateIssuer> {
  const company = await readCompanyArgument(database, workspaceId, raw);
  if (company === null || company.matchedOrganization === null) return NO_ISSUER;
  const { rows } = await database.query<{ organization_id: string }>(FIND_ORGANIZATION_SQL, [workspaceId, company.matchKey]);
  const [row] = rows;
  return row === undefined ? NO_ISSUER : { organizationId: row.organization_id, matchedName: company.matchedOrganization };
}
