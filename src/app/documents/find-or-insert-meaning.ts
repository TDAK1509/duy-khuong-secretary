import type { Transaction } from '../db/transaction.ts';
import { STANDARD_MEANING_NAMES } from '../reading/document-rules.ts';
import type { ReadingDetail } from '../reading/reading.ts';
import { buildMatchKey } from './build-match-key.ts';

const MAX_MEANING_NAME_LENGTH = 80;

export async function findOrInsertMeaning(transaction: Transaction, workspaceId: string, detail: ReadingDetail): Promise<string | null> {
  const matchKey = buildMatchKey(detail.meaning ?? '');
  if (matchKey === '') return null;
  const [row] = await transaction.query<{ id: string }>(
    `INSERT INTO meanings (workspace_id, value_type, name, match_key) VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, value_type, match_key) DO UPDATE SET name = meanings.name
     RETURNING id`,
    [workspaceId, detail.date_time ? 'date' : 'number', toMeaningName(detail.meaning ?? '', matchKey), matchKey],
  );
  if (!row) throw new Error('The meaning was not stored');
  return row.id;
}

function toMeaningName(printed: string, matchKey: string): string {
  const standardName = STANDARD_MEANING_NAMES.find((name) => buildMatchKey(name) === matchKey);
  return standardName ?? printed.trim().slice(0, MAX_MEANING_NAME_LENGTH);
}
