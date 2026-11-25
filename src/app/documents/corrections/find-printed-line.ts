import type { Transaction } from '../../db/transaction.ts';
import { buildAccentFreeKey } from '../../facts/link-facts.ts';
import { buildMatchKey } from '../build-match-key.ts';
import type { PrintedValue } from './paper-correction.ts';

export type PrintedLine = { id: string; line_no: number; label: string; value: string; number: string | null; unit: string | null; meaning_key: string | null };

const FIND_LINE_SQL = `
  SELECT line.id, line.line_no, line.label, line.value, line.number::text AS number, line.unit, meaning.match_key AS meaning_key
  FROM document_lines line
  LEFT JOIN meanings meaning ON meaning.id = line.meaning_id AND meaning.workspace_id = line.workspace_id
  WHERE line.workspace_id = $1 AND line.document_id = $2 AND line.item IS NULL
    AND (${buildAccentFreeKey('line.label')} = $3 OR (meaning.value_type = 'number' AND meaning.match_key = $4::text))
  ORDER BY line.line_no
  LIMIT 1`;

export async function findPrintedLine(transaction: Transaction, workspaceId: string, paperId: string, { label, meaning }: PrintedValue): Promise<PrintedLine | null> {
  const meaningKey = meaning === null ? null : buildMatchKey(meaning);
  const [line] = await transaction.query<PrintedLine>(FIND_LINE_SQL, [workspaceId, paperId, buildMatchKey(label), meaningKey]);
  return line ?? null;
}
