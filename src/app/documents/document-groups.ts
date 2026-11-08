import type { WhereClause } from '../records/where-clause.ts';
import { buildDocumentDateSql } from './build-document-date.ts';

export const DOCUMENT_GROUPS = ['none', 'day'] as const;

export type DocumentGroup = (typeof DOCUMENT_GROUPS)[number];

export function buildGroupSql(group: DocumentGroup, where: WhereClause, dateMeaning: string | null): string {
  if (group === 'none') return 'NULL::text';
  return `to_char(${buildDocumentDateSql(where, dateMeaning)}, 'YYYY-MM-DD')`;
}
