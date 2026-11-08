import { WhereClause } from '../records/where-clause.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentFilters = { organization: string; stage: string | null };

export type OrganizationLink = 'organization_id' | 'proposed_organization_id';

export function addDocumentFilters(where: WhereClause, filters: DocumentFilters, link: OrganizationLink): void {
  where.require(buildOrganizationCondition(where, filters.organization, link));
  if (filters.stage !== null) where.require(`document.stage = ${where.bind(filters.stage)}`);
}

function buildOrganizationCondition(where: WhereClause, organization: string, link: OrganizationLink): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party JOIN organization_aliases alias ON alias.organization_id = party.${link}
    WHERE party.document_id = document.id AND alias.match_key = ${where.bind(buildMatchKey(organization))})`;
}
