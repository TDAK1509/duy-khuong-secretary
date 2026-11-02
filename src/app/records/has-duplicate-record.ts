import type { Transaction } from '../db/transaction.ts';
import { isDuplicateRecord, type DuplicateFields } from './is-duplicate-record.ts';
import type { NewRecord } from './new-record.ts';

type SavedRecordRow = {
  category: DuplicateFields['category'];
  maintenance_item: string | null;
  vehicle_plate: string | null;
  document_number: string | null;
  occurred_on: string | null;
  amount_vnd: number | null;
  identifiers: string[];
  details: DuplicateFields['details'];
};

export async function hasDuplicateRecord(
  transaction: Transaction,
  workspaceId: string,
  records: NewRecord[],
): Promise<boolean> {
  for (const record of records) {
    if (await hasSavedCopy(transaction, workspaceId, record)) return true;
  }
  return false;
}

async function hasSavedCopy(transaction: Transaction, workspaceId: string, record: NewRecord): Promise<boolean> {
  const saved = await transaction.query<SavedRecordRow>(...buildSavedCopyQuery(workspaceId, record));
  return saved.map(toDuplicateFields).some((existing) => isDuplicateRecord(existing, record));
}

function buildSavedCopyQuery(workspaceId: string, record: NewRecord): [string, unknown[]] {
  const values: unknown[] = [workspaceId, record.category];
  const conditions = ['workspace_id = $1', 'category = $2'];
  const equalOrBothEmpty = (column: string, value: string | null): void => {
    if (value === null) return void conditions.push(`${column} IS NULL`);
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };
  equalOrBothEmpty('document_number', record.documentNumber);
  equalOrBothEmpty('occurred_on', record.occurredOn);
  return [
    `SELECT category, maintenance_item, vehicle_plate, document_number, occurred_on::text AS occurred_on,
       amount_vnd::float8 AS amount_vnd, identifiers, details
     FROM records WHERE ${conditions.join(' AND ')}`,
    values,
  ];
}

function toDuplicateFields(row: SavedRecordRow): DuplicateFields {
  return {
    category: row.category,
    maintenanceItem: row.maintenance_item,
    vehiclePlate: row.vehicle_plate,
    documentNumber: row.document_number,
    occurredOn: row.occurred_on,
    amountVnd: row.amount_vnd,
    identifiers: row.identifiers,
    details: row.details,
  };
}
