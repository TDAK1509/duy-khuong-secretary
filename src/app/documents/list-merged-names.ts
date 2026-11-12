import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { formatVietnamDate } from '../time/format-vietnam-date.ts';
import { buildMatchKey } from './build-match-key.ts';

export type ListedMergedName = { printed_name: string; organization: string; merged_on: string; document_count: number };

export type MergedNameList = { merged_names: ListedMergedName[]; left_out: number };

type MergedNameRow = { printed_name: string; organization: string; match_key: string; created_at: Date; document_count: number };

const MAX_MERGED_NAMES = 50;

const SELECT_MERGED_NAMES = `SELECT merged.printed_name, organization.name AS organization, merged.match_key, merged.created_at,
    (SELECT count(DISTINCT party.document_id)::int FROM document_parties party
      WHERE party.organization_id = merged.organization_id AND party.match_key = merged.match_key) AS document_count
  FROM merged_names merged
  JOIN organizations organization ON organization.id = merged.organization_id
  WHERE merged.workspace_id = $1
  ORDER BY merged.created_at DESC, merged.id DESC`;

export async function listMergedNames(database: Database, scope: AccessScope, text: string | null): Promise<MergedNameList> {
  const { rows } = await database.query<MergedNameRow>(SELECT_MERGED_NAMES, [scope.workspaceId]);
  const textKey = buildMatchKey(text ?? '');
  const matching = rows.filter((row) => matchesText(row, textKey));
  return { merged_names: matching.slice(0, MAX_MERGED_NAMES).map(toListedMergedName), left_out: Math.max(0, matching.length - MAX_MERGED_NAMES) };
}

function matchesText(row: MergedNameRow, textKey: string): boolean {
  return [row.match_key, buildMatchKey(row.organization)].some((key) => key.includes(textKey));
}

function toListedMergedName(row: MergedNameRow): ListedMergedName {
  return { printed_name: row.printed_name, organization: row.organization, merged_on: formatVietnamDate(row.created_at), document_count: row.document_count };
}
