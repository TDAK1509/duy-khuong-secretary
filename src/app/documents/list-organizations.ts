import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { buildMatchKey } from './build-match-key.ts';
import { encodeOrganizationCursor, type OrganizationCursor } from './organization-cursor.ts';

const PAGE_SIZE = 50;

export type ListedOrganization = { name: string; type: string; aliases: string[]; document_count: number };

export type OrganizationPage = { organizations: ListedOrganization[]; nextCursor: string | null };

type OrganizationRow = ListedOrganization & { id: string };

const SELECT_ORGANIZATION_PAGE = `WITH page AS (
    SELECT organization.id, organization.name, organization.type
    FROM organizations organization
    WHERE organization.workspace_id = $1
      AND ($3::text IS NULL OR (organization.name, organization.id) > ($3, $4::uuid))
      AND (strpos(regexp_replace(lower(unaccent(organization.name)), '[^a-z0-9]', '', 'g'), $2) > 0
        OR EXISTS (SELECT 1 FROM organization_aliases alias WHERE alias.organization_id = organization.id AND strpos(alias.match_key, $2) > 0))
    ORDER BY organization.name, organization.id
    LIMIT ${PAGE_SIZE + 1}
  )
  SELECT page.id, page.name, page.type,
    (SELECT coalesce(array_agg(alias.printed_name ORDER BY alias.created_at, alias.id), ARRAY[]::text[]) FROM organization_aliases alias WHERE alias.organization_id = page.id) AS aliases,
    (SELECT count(DISTINCT party.document_id)::int FROM document_parties party WHERE party.organization_id = page.id) AS document_count
  FROM page
  ORDER BY page.name, page.id`;

export async function listOrganizations(database: Database, scope: AccessScope, text: string | null, cursor: OrganizationCursor | null): Promise<OrganizationPage> {
  const values = [scope.workspaceId, buildMatchKey(text ?? ''), cursor?.name ?? null, cursor?.id ?? null];
  const { rows } = await database.query<OrganizationRow>(SELECT_ORGANIZATION_PAGE, values);
  return toPage(rows);
}

function toPage(rows: OrganizationRow[]): OrganizationPage {
  const pageRows = rows.slice(0, PAGE_SIZE);
  const last = pageRows[pageRows.length - 1];
  const hasMore = rows.length > PAGE_SIZE && last !== undefined;
  return {
    organizations: pageRows.map(({ name, type, aliases, document_count }) => ({ name, type, aliases, document_count })),
    nextCursor: hasMore ? encodeOrganizationCursor({ name: last.name, id: last.id }) : null,
  };
}
