import { normalizeCode, normalizeCodeSet } from '../reading/normalize.ts';
import type { ReadingItem } from '../reading/reading.ts';
import { summarizeRecord } from './summarize-record.ts';

export type NewRecord = {
  itemIndex: number;
  category: ReadingItem['category'];
  maintenanceItem: string | null;
  vehiclePlate: string | null;
  documentNumber: string | null;
  occurredOn: string | null;
  amountVnd: number | null;
  identifiers: string[];
  summary: string;
  details: ReadingItem['details'];
};

export function buildNewRecords(items: ReadingItem[]): NewRecord[] {
  return items.map(buildNewRecord);
}

function buildNewRecord(item: ReadingItem, itemIndex: number): NewRecord {
  const fields = {
    category: item.category,
    maintenanceItem: item.maintenance_item,
    vehiclePlate: normalizeCode(item.vehicle_plate),
    documentNumber: normalizeCode(item.document_number),
    identifiers: normalizeCodeSet(item.identifiers),
  };
  return {
    itemIndex,
    ...fields,
    occurredOn: item.occurred_on,
    amountVnd: item.amount_vnd,
    summary: summarizeRecord(fields),
    details: item.details,
  };
}
