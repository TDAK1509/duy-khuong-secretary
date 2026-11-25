import type { Transaction } from '../../db/transaction.ts';
import { buildAccentFreeKey } from '../../facts/link-facts.ts';
import { buildMatchKey } from '../build-match-key.ts';

export type PrintedLine = { id: string; line_no: number; value: string; number: string | null; unit: string | null };

const FIND_LINE_SQL = `
  SELECT id, line_no, value, number::text AS number, unit
  FROM document_lines
  WHERE workspace_id = $1 AND document_id = $2 AND item IS NULL AND ${buildAccentFreeKey('label')} = $3
  ORDER BY line_no
  LIMIT 1`;

export async function findPrintedLine(transaction: Transaction, workspaceId: string, paperId: string, label: string): Promise<PrintedLine | null> {
  const [line] = await transaction.query<PrintedLine>(FIND_LINE_SQL, [workspaceId, paperId, buildMatchKey(label)]);
  return line ?? null;
}
