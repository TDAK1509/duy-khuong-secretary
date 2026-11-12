import type { WhereClause } from '../records/where-clause.ts';
import { listPartyConditions, type DocumentFilters } from './add-document-filters.ts';
import { buildDocumentDateSql } from './build-document-date.ts';

export const DOCUMENT_GROUPS = ['none', 'organization', 'kind', 'plate', 'stage', 'day', 'month'] as const;

export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

const DATE_FORMATS: Partial<Record<DocumentGroup, string>> = { day: 'YYYY-MM-DD', month: 'YYYY-MM' };

const COLUMNS: Partial<Record<DocumentGroup, string>> = { kind: 'document.kind', plate: 'document.vehicle_plate', stage: 'document.stage' };

export function buildGroupSql(group: DocumentGroup, where: WhereClause, filters: DocumentFilters): string {
  const dateFormat = DATE_FORMATS[group];
  if (dateFormat !== undefined) return `to_char(${buildDocumentDateSql(where, filters.dateMeaning)}, '${dateFormat}')`;
  if (group === 'organization') return buildOrganizationGroupSql(where, filters);
  return COLUMNS[group] ?? 'NULL::text';
}

function buildOrganizationGroupSql(where: WhereClause, filters: DocumentFilters): string {
  const conditions = listPartyConditions(where, filters).join(' AND ');
  return `(SELECT min(organization.name) FROM document_parties party
    JOIN organizations organization ON organization.id = party.organization_id WHERE ${conditions})`;
}
