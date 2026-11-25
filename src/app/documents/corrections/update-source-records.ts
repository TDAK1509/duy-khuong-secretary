import type { Transaction } from '../../db/transaction.ts';
import type { NewPaperValues } from './paper-correction.ts';

const UPDATE_RECORDS_SQL = `
  UPDATE records record
  SET vehicle_plate = coalesce($3, record.vehicle_plate), document_number = coalesce($4, record.document_number),
    occurred_on = coalesce($5::date, record.occurred_on)
  WHERE record.workspace_id = $2
    AND EXISTS (
      SELECT 1 FROM document_sources source
      WHERE source.document_id = $1 AND source.workspace_id = $2
        AND source.message_id = record.message_id AND source.item_index = record.item_index)`;

export async function updateSourceRecords(transaction: Transaction, workspaceId: string, paperId: string, values: NewPaperValues): Promise<void> {
  if (values.plate === null && values.documentNumber === null && values.documentDate === null) return;
  await transaction.query(UPDATE_RECORDS_SQL, [paperId, workspaceId, values.plate, values.documentNumber, values.documentDate]);
}
