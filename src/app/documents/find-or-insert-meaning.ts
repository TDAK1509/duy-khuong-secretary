import type { Transaction } from '../db/transaction.ts';
import { STANDARD_MEANING_NAMES } from '../reading/document-rules.ts';
import type { ReadingDetail } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';

const MAX_MEANING_NAME_LENGTH = 80;

const UPSERT_MEANINGS_SQL = `
  INSERT INTO meanings (workspace_id, value_type, name, match_key)
  SELECT $1, meaning.value_type, meaning.name, meaning.match_key
  FROM jsonb_to_recordset($2::jsonb) AS meaning(value_type text, name text, match_key text)
  ON CONFLICT (workspace_id, value_type, match_key) DO UPDATE SET name = meanings.name
  RETURNING id, value_type, match_key`;

export async function findOrInsertMeaning(transaction: Transaction, workspaceId: string, detail: ReadingDetail): Promise<string | null> {
  const meaningIds = await findOrInsertMeanings(transaction, workspaceId, [detail]);
  return meaningIds.get(describeMeaning(detail)) ?? null;
}

export async function findOrInsertMeanings(transaction: Transaction, workspaceId: string, details: ReadingDetail[]): Promise<Map<string, string>> {
  const meanings = new Map(details.flatMap((detail) => buildMeaningRow(detail)).map((meaning) => [`${meaning.value_type}|${meaning.match_key}`, meaning]));
  if (meanings.size === 0) return new Map();
  const rows = await transaction.query<{ id: string; value_type: string; match_key: string }>(UPSERT_MEANINGS_SQL, [workspaceId, JSON.stringify([...meanings.values()])]);
  if (rows.length !== meanings.size) throw new Error('A meaning was not stored');
  return new Map(rows.map((row) => [`${row.value_type}|${row.match_key}`, row.id]));
}

export function describeMeaning(detail: ReadingDetail): string {
  return `${readValueType(detail)}|${buildMatchKey(detail.meaning ?? '')}`;
}

function buildMeaningRow(detail: ReadingDetail): { value_type: string; name: string; match_key: string }[] {
  const matchKey = buildMatchKey(detail.meaning ?? '');
  return matchKey === '' ? [] : [{ value_type: readValueType(detail), name: toMeaningName(detail.meaning ?? '', matchKey), match_key: matchKey }];
}

function readValueType(detail: ReadingDetail): string {
  return detail.date_time ? 'date' : 'number';
}

function toMeaningName(printed: string, matchKey: string): string {
  const standardName = STANDARD_MEANING_NAMES.find((name) => buildMatchKey(name) === matchKey);
  return standardName ?? printed.trim().slice(0, MAX_MEANING_NAME_LENGTH);
}
