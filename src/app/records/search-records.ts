import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
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

export async function searchRecords(database: Database, scope: AccessScope): Promise<SearchPage> {
  const where = new WhereClause();
  where.require(`record.workspace_id = ${where.bind(scope.workspaceId)}`);
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
