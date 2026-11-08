import { normalizeCode } from '../reading/normalize.ts';
import { buildDocumentDateSql } from './build-document-date.ts';
import { buildAccentFreeEquals } from '../records/search-records.ts';
import type { WhereClause } from '../records/where-clause.ts';
import { buildMatchKey } from './build-match-key.ts';

export type DocumentFilters = { organization: string | null; role: string | null; stage: string | null; kind: string | null; plate: string | null; dateFrom: string | null; dateTo: string | null; dateMeaning: string | null };

export type OrganizationLink = 'organization_id' | 'proposed_organization_id';

export function addDocumentFilters(where: WhereClause, filters: DocumentFilters, link: OrganizationLink): void {
  if (filters.organization !== null || filters.role !== null) where.require(buildPartyExists(where, filters, link));
  if (filters.stage !== null) where.require(`document.stage = ${where.bind(filters.stage)}`);
  if (filters.kind !== null) where.require(buildAccentFreeEquals(where, 'document.kind', filters.kind));
  if (filters.plate !== null) where.require(`document.vehicle_plate = ${where.bind(normalizeCode(filters.plate))}`);
  addDateRange(where, filters);
}

export function buildPartyExists(where: WhereClause, filters: DocumentFilters, link: OrganizationLink): string {
  const conditions = [
    'party.document_id = document.id',
    `party.${link} IS NOT NULL`,
    ...listRoleCondition(where, filters.role),
    ...listOrganizationCondition(where, filters.organization, link),
  ];
  return `EXISTS (SELECT 1 FROM document_parties party WHERE ${conditions.join(' AND ')})`;
}

function listRoleCondition(where: WhereClause, role: string | null): string[] {
  return role === null ? [] : [`party.role = ${where.bind(role)}`];
}

function listOrganizationCondition(where: WhereClause, organization: string | null, link: OrganizationLink): string[] {
  if (organization === null) return [];
  const matchKey = where.bind(buildMatchKey(organization));
  return [`party.${link} IN (SELECT alias.organization_id FROM organization_aliases alias WHERE alias.match_key = ${matchKey})`];
}

function addDateRange(where: WhereClause, filters: DocumentFilters): void {
  if (filters.dateFrom !== null) where.require(`${buildDocumentDateSql(where, filters.dateMeaning)} >= ${where.bind(filters.dateFrom)}::date`);
  if (filters.dateTo !== null) where.require(`${buildDocumentDateSql(where, filters.dateMeaning)} <= ${where.bind(filters.dateTo)}::date`);
}
