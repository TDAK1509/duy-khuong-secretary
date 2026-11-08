import { isDeepStrictEqual } from 'node:util';
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
  lineItems: PlannedItem[];
};

export function pairItemsWithRecords(items: ReadingItem[], records: NewRecord[]): PlannedItem[] {
  return items.flatMap((item, index) => {
    const record = records[index];
    return record ? [{ item, record }] : [];
  });
}

export function groupItems(planned: PlannedItem[]): DocumentDraft[] {
  const drafts: DocumentDraft[] = [];
  for (const next of planned) {
    const draft = drafts.find((candidate) => canJoin(candidate, next));
    if (draft) addToDraft(draft, next);
    else drafts.push(startDraft(next));
  }
  return drafts;
}

function canJoin(draft: DocumentDraft, { record, item }: PlannedItem): boolean {
  return (
    draft.issuerKey !== null &&
    draft.issuerKey === findIssuerKey(item) &&
    draft.documentNumber !== null &&
    draft.documentNumber === record.documentNumber &&
    draft.documentDate === item.occurred_on
  );
}

function addToDraft(draft: DocumentDraft, next: PlannedItem): void {
  draft.items.push(next);
  if (!draft.lineItems.some(({ item }) => isDeepStrictEqual(item, next.item))) draft.lineItems.push(next);
}

function startDraft(planned: PlannedItem): DocumentDraft {
  const { item, record } = planned;
  return {
    issuerKey: findIssuerKey(item),
    documentNumber: record.documentNumber,
    documentDate: item.occurred_on,
    vehiclePlate: record.vehiclePlate,
    items: [planned],
    lineItems: [planned],
  };
}

function findIssuerKey(item: ReadingItem): string | null {
  const issuer = item.parties.find((party) => party.role === 'issuer');
  const key = issuer ? buildMatchKey(issuer.printed_name) : '';
  return key === '' ? null : key;
}
