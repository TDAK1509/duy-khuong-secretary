import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { formatVietnamDate } from '../time/format-vietnam-date.ts';
import { buildMatchKey } from './build-match-key.ts';

export type ListedMergedName = { printed_name: string; organization: string; merged_on: string; document_count: number };

export type MergedNameList = { merged_names: ListedMergedName[]; left_out: number };

type MergedNameRow = { organization_id: string; printed_name: string; organization: string; match_key: string; created_at: Date };

const MAX_MERGED_NAMES = 50;

const SELECT_MERGED_NAMES = `SELECT merged.organization_id, merged.printed_name, organization.name AS organization, merged.match_key, merged.created_at
  FROM merged_names merged
  JOIN organizations organization ON organization.id = merged.organization_id
  WHERE merged.workspace_id = $1
  ORDER BY merged.created_at DESC, merged.id DESC`;

const COUNT_DOCUMENTS = `SELECT wanted.organization_id, wanted.match_key, count(DISTINCT party.document_id)::int AS document_count
  FROM unnest($1::uuid[], $2::text[]) AS wanted(organization_id, match_key)
  LEFT JOIN document_parties party ON party.organization_id = wanted.organization_id AND party.match_key = wanted.match_key
  GROUP BY wanted.organization_id, wanted.match_key`;

export async function listMergedNames(database: Database, scope: AccessScope, text: string | null): Promise<MergedNameList> {
  const { rows } = await database.query<MergedNameRow>(SELECT_MERGED_NAMES, [scope.workspaceId]);
  const textKey = buildMatchKey(text ?? '');
  const matching = rows.filter((row) => matchesText(row, textKey));
  const returned = matching.slice(0, MAX_MERGED_NAMES);
  const counts = await countDocuments(database, returned);
  return { merged_names: returned.map((row) => toListedMergedName(row, counts)), left_out: matching.length - returned.length };
}

function matchesText(row: MergedNameRow, textKey: string): boolean {
  return [row.match_key, buildMatchKey(row.organization)].some((key) => key.includes(textKey));
}

async function countDocuments(database: Database, rows: MergedNameRow[]): Promise<Map<string, number>> {
  const { rows: counted } = await database.query<{ organization_id: string; match_key: string; document_count: number }>(COUNT_DOCUMENTS, [
    rows.map((row) => row.organization_id),
    rows.map((row) => row.match_key),
  ]);
  return new Map(counted.map((count) => [`${count.organization_id}:${count.match_key}`, count.document_count]));
}

function toListedMergedName(row: MergedNameRow, counts: Map<string, number>): ListedMergedName {
  const documentCount = counts.get(`${row.organization_id}:${row.match_key}`) ?? 0;
  return { printed_name: row.printed_name, organization: row.organization, merged_on: formatVietnamDate(row.created_at), document_count: documentCount };
}
