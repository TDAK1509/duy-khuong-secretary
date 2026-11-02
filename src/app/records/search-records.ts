import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { normalizeCode, toAccentFreeForm } from '../reading/normalize.ts';
import { WhereClause } from './where-clause.ts';

export type SearchFilters = {
  text: string | null;
  category: string | null;
  member: string | null;
  plate: string | null;
  addedFrom: string | null;
  addedTo: string | null;
  cursor: string | null;
};

export type FoundRecord = {
  id: string;
  member: string;
  category: string;
  maintenance_item: string | null;
  plate: string | null;
  document_number: string | null;
  occurred_on: string | null;
  amount_vnd: number | null;
  summary: string;
  identifiers: string[];
  details: { label: string; value: string }[];
  added_at: string;
  has_photo: boolean;
};

export type SearchPage = { items: FoundRecord[]; nextCursor: string | null };

export async function searchRecords(database: Database, scope: AccessScope, filters: SearchFilters): Promise<SearchPage> {
  const where = new WhereClause();
  where.require(`record.workspace_id = ${where.bind(scope.workspaceId)}`);
  if (filters.text !== null) where.require(buildTextCondition(where, filters.text));
  if (filters.member !== null) where.require(buildMemberCondition(where, filters.member));
  const { rows } = await database.query<FoundRecord>(
    `SELECT record.id, record.sender_name AS member, record.category, record.maintenance_item,
       record.vehicle_plate AS plate, record.document_number,
       to_char(record.occurred_on, 'YYYY-MM-DD') AS occurred_on, record.amount_vnd::float8 AS amount_vnd,
       record.summary, record.identifiers, record.details,
       to_char(record.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') AS added_at,
       message.image_key IS NOT NULL AS has_photo
     FROM records record JOIN messages message ON message.id = record.message_id
     WHERE ${where.toSql()}
     ORDER BY record.created_at DESC, record.id DESC`,
    where.values,
  );
  return { items: rows, nextCursor: null };
}

function buildTextCondition(where: WhereClause, text: string): string {
  const code = normalizeCode(text);
  if (code === null) return 'false';
  const bound = where.bind(code);
  return `(strpos(record.vehicle_plate, ${bound}) > 0 OR strpos(record.document_number, ${bound}) > 0
    OR EXISTS (SELECT 1 FROM unnest(record.identifiers) identifier WHERE strpos(identifier, ${bound}) > 0))`;
}

function buildMemberCondition(where: WhereClause, member: string): string {
  const bound = where.bind(toAccentFreeForm(member) ?? '');
  return `regexp_replace(trim(lower(unaccent(record.sender_name))), '\\s+', ' ', 'g') = ${bound}`;
}
