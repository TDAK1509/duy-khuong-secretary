import { WhereClause } from '../records/where-clause.ts';
import { addDocumentFilters, type DocumentFilters, type OrganizationLink } from './add-document-filters.ts';

export type DocumentRule = { status: 'accepted' | 'needs_review'; link: OrganizationLink };

export const ACCEPTED_CONFIRMED: DocumentRule = { status: 'accepted', link: 'organization_id' };

export function buildDocumentWhere(workspaceId: string, filters: DocumentFilters, rule: DocumentRule): WhereClause {
  const where = new WhereClause();
  where.require(`document.workspace_id = ${where.bind(workspaceId)}`);
  where.require(`document.status = ${where.bind(rule.status)}`);
  addDocumentFilters(where, filters, rule.link);
  return where;
}
