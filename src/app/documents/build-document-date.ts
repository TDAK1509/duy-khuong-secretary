import type { WhereClause } from '../records/where-clause.ts';
import { buildMatchKey } from './build-match-key.ts';

export function buildDocumentDateSql(where: WhereClause, dateMeaning: string | null): string {
  if (dateMeaning === null) return 'document.document_date';
  return `(SELECT min(date_line.at)::date
    FROM document_lines date_line JOIN meanings date_meaning ON date_meaning.id = date_line.meaning_id
    WHERE date_line.document_id = document.id AND date_meaning.value_type = 'date'
      AND date_meaning.match_key = ${where.bind(buildMatchKey(dateMeaning))})`;
}
