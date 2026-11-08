import type { WhereClause } from '../records/where-clause.ts';
import { buildDocumentDateSql } from './build-document-date.ts';

export const DOCUMENT_GROUPS = ['none', 'kind', 'day', 'month'] as const;

export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

const DATE_FORMATS: Partial<Record<DocumentGroup, string>> = { day: 'YYYY-MM-DD', month: 'YYYY-MM' };

const COLUMNS: Partial<Record<DocumentGroup, string>> = { kind: 'document.kind' };

export function buildGroupSql(group: DocumentGroup, where: WhereClause, dateMeaning: string | null): string {
  const dateFormat = DATE_FORMATS[group];
  if (dateFormat !== undefined) return `to_char(${buildDocumentDateSql(where, dateMeaning)}, '${dateFormat}')`;
  return COLUMNS[group] ?? 'NULL::text';
}
