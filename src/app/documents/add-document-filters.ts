import { WhereClause } from '../records/where-clause.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentFilters = { organization: string; stage: string | null };

export function addDocumentFilters(where: WhereClause, filters: DocumentFilters): void {
  where.require(buildOrganizationCondition(where, filters.organization));
  if (filters.stage !== null) where.require(`document.stage = ${where.bind(filters.stage)}`);
}

function buildOrganizationCondition(where: WhereClause, organization: string): string {
  return `EXISTS (
    SELECT 1 FROM document_parties party JOIN organization_aliases alias ON alias.organization_id = party.organization_id
    WHERE party.document_id = document.id AND alias.match_key = ${where.bind(buildMatchKey(organization))})`;
}
