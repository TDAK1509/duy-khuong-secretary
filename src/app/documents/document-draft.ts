import type { ReadingItem } from '../reading/reading.ts';
import type { NewRecord } from '../records/new-record.ts';
import { buildMatchKey } from './build-match-key.ts';

export type PlannedItem = { item: ReadingItem; record: NewRecord };

export type DocumentDraft = {
  issuerKey: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  vehiclePlate: string | null;
  items: PlannedItem[];
};

export function pairItemsWithRecords(items: ReadingItem[], records: NewRecord[]): PlannedItem[] {
  return items.flatMap((item, index) => {
    const record = records[index];
    return record ? [{ item, record }] : [];
  });
}

export function startDraft(planned: PlannedItem): DocumentDraft {
  const { item, record } = planned;
  return {
    issuerKey: findIssuerKey(item),
    documentNumber: record.documentNumber,
    documentDate: item.occurred_on,
    vehiclePlate: record.vehiclePlate,
    items: [planned],
  };
}

function findIssuerKey(item: ReadingItem): string | null {
  const issuer = item.parties.find((party) => party.role === 'issuer');
  const key = issuer ? buildMatchKey(issuer.printed_name) : '';
  return key === '' ? null : key;
}
