import type { Transaction } from '../db/transaction.ts';
import type { NewRecord } from './new-record.ts';

export type RecordedMessage = { id: string; workspaceId: string; userId: string };

export async function insertRecords(
  transaction: Transaction,
  message: RecordedMessage,
  records: NewRecord[],
): Promise<void> {
  for (const record of records) await insertRecord(transaction, message, record);
}

async function insertRecord(
  transaction: Transaction,
  message: RecordedMessage,
  record: NewRecord,
): Promise<void> {
  await transaction.query(
    `INSERT INTO records
       (workspace_id, user_id, message_id, item_index, sender_name, category, document_title, maintenance_item,
        vehicle_plate, document_number, occurred_on, amount_vnd, identifiers, summary, details)
     VALUES ($1, $2, $3, $4,
       (SELECT display_name FROM memberships WHERE workspace_id = $1 AND user_id = $2),
       $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
    [
      message.workspaceId,
      message.userId,
      message.id,
      record.itemIndex,
      record.category,
      record.documentTitle,
      record.maintenanceItem,
      record.vehiclePlate,
      record.documentNumber,
      record.occurredOn,
      record.amountVnd,
      record.identifiers,
      record.summary,
      JSON.stringify(record.details),
    ],
  );
}
