import type { Transaction } from '../../db/transaction.ts';
import { buildAccentFreeKey } from '../../facts/link-facts.ts';
import { readNumberPair } from '../../reading/reading.ts';
import { buildMatchKey } from '../build-match-key.ts';
import type { PrintedValue } from './paper-correction.ts';

function buildReplacedDetailsSql(detailsColumn: string): string {
  return `(
    SELECT coalesce(jsonb_agg(CASE WHEN ${buildAccentFreeKey(`entry.detail ->> 'label'`)} = $3 THEN entry.detail || $4::jsonb ELSE entry.detail END ORDER BY entry.entry_no), '[]'::jsonb)
    FROM jsonb_array_elements(${detailsColumn}) WITH ORDINALITY AS entry(detail, entry_no)
  )`;
}

const UPDATE_PAPER_DETAILS_SQL = `
  UPDATE documents SET details = ${buildReplacedDetailsSql('documents.details')}
  WHERE id = $1 AND workspace_id = $2`;

const UPDATE_RECORD_DETAILS_SQL = `
  UPDATE records record SET details = ${buildReplacedDetailsSql('record.details')}
  WHERE record.workspace_id = $2
    AND EXISTS (
      SELECT 1 FROM document_sources source
      WHERE source.document_id = $1 AND source.workspace_id = $2
        AND source.message_id = record.message_id AND source.item_index = record.item_index)`;

export async function updatePrintedDetails(transaction: Transaction, workspaceId: string, paperId: string, printed: PrintedValue): Promise<void> {
  const values = [paperId, workspaceId, buildMatchKey(printed.label), JSON.stringify({ value: printed.value, ...readNumberPair(printed.number, printed.unit) })];
  await transaction.query(UPDATE_PAPER_DETAILS_SQL, values);
  await transaction.query(UPDATE_RECORD_DETAILS_SQL, values);
}
