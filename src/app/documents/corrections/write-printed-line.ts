import type { Transaction } from '../../db/transaction.ts';
import { readLinePair, readNumberPair, type ReadingDetail } from '../../reading/reading.ts';
import { findOrInsertMeaning } from '../find-or-insert-meaning.ts';
import { buildLineRow } from '../insert-lines.ts';
import { insertRow } from '../insert-row.ts';
import { findPrintedLine } from './find-printed-line.ts';
import type { PrintedValue } from './paper-correction.ts';

type PaperLines = { workspaceId: string; paperId: string };

const NEXT_LINE_NO_SQL = 'SELECT coalesce(max(line_no) + 1, 0)::int AS line_no FROM document_lines WHERE workspace_id = $1 AND document_id = $2';

const UPDATE_LINE_SQL = `
  UPDATE document_lines SET value = $3, number = $4, unit = $5, at = $6, meaning_id = $7
  WHERE id = $1 AND workspace_id = $2`;

export async function writePrintedLine(transaction: Transaction, lines: PaperLines, printed: PrintedValue): Promise<void> {
  const detail = toReadingDetail(printed);
  const meaningId = await findOrInsertMeaning(transaction, lines.workspaceId, detail);
  const line = await findPrintedLine(transaction, lines.workspaceId, lines.paperId, printed.label);
  if (line === null) await insertPrintedLine(transaction, lines, detail, meaningId);
  else await updatePrintedLine(transaction, lines, line.id, buildLineRow(lines.workspaceId, lines.paperId, line.line_no, detail, meaningId));
}

function toReadingDetail({ label, value, meaning, number, unit }: PrintedValue): ReadingDetail {
  return { label, value, meaning, item: null, date_time: null, ...readNumberPair(number, unit), ...readLinePair(number, unit) };
}

async function insertPrintedLine(transaction: Transaction, { workspaceId, paperId }: PaperLines, detail: ReadingDetail, meaningId: string | null): Promise<void> {
  const [next] = await transaction.query<{ line_no: number }>(NEXT_LINE_NO_SQL, [workspaceId, paperId]);
  await insertRow(transaction, 'document_lines', buildLineRow(workspaceId, paperId, next?.line_no ?? 0, detail, meaningId));
}

async function updatePrintedLine(transaction: Transaction, { workspaceId }: PaperLines, lineId: string, row: Record<string, unknown>): Promise<void> {
  await transaction.query(UPDATE_LINE_SQL, [lineId, workspaceId, row['value'], row['number'], row['unit'], row['at'], row['meaning_id']]);
}
