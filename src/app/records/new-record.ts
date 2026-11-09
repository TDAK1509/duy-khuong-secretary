import { normalizeCode, normalizeCodeSet, normalizeMaintenanceItem } from '../reading/normalize.ts';
import { readNumberPair, type NumberPair, type ReadingDetail, type ReadingItem } from '../reading/reading.ts';
import { summarizeRecord } from './summarize-record.ts';

const FALLBACK_CATEGORY = 'khác';

export type NewRecord = {
  itemIndex: number;
  category: ReadingItem['category'];
  documentTitle: string | null;
  maintenanceItem: string | null;
  vehiclePlate: string | null;
  documentNumber: string | null;
  occurredOn: string | null;
  amountVnd: number | null;
  identifiers: string[];
  summary: string;
  details: RecordDetail[];
};

export type RecordDetail = { label: string; value: string } & NumberPair;

export function buildNewRecords(items: ReadingItem[]): NewRecord[] {
  return items.map(buildNewRecord);
}

function buildNewRecord(item: ReadingItem, itemIndex: number): NewRecord {
  const fields = {
    category: item.category.trim() === '' ? FALLBACK_CATEGORY : item.category,
    documentTitle: item.document_title?.trim() === '' ? null : item.document_title,
    maintenanceItem: normalizeMaintenanceItem(item.maintenance_item),
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
    details: item.details.map(toRecordDetail),
  };
}

function toRecordDetail(detail: ReadingDetail): RecordDetail {
  return { label: detail.label, value: detail.value, ...readNumberPair(detail.number, detail.unit) };
}
