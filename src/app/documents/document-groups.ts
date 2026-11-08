import type { WhereClause } from '../records/where-clause.ts';
import { buildDocumentDateSql } from './build-document-date.ts';

export const DOCUMENT_GROUPS = ['none', 'day', 'month'] as const;

export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

const DATE_FORMATS: Partial<Record<DocumentGroup, string>> = { day: 'YYYY-MM-DD', month: 'YYYY-MM' };

export function buildGroupSql(group: DocumentGroup, where: WhereClause, dateMeaning: string | null): string {
  const dateFormat = DATE_FORMATS[group];
  if (dateFormat === undefined) return 'NULL::text';
  return `to_char(${buildDocumentDateSql(where, dateMeaning)}, '${dateFormat}')`;
}
