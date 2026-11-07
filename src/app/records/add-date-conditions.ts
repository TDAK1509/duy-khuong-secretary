import type { WhereClause } from './where-clause.ts';

export type AddedDateRange = { addedFrom: string | null; addedTo: string | null };

export type DocumentDateRange = { occurredFrom: string | null; occurredTo: string | null };

export function addDateConditions(where: WhereClause, range: AddedDateRange): void {
  const vietnamDate = `(record.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
  if (range.addedFrom !== null) where.require(`${vietnamDate} >= ${where.bind(range.addedFrom)}::date`);
  if (range.addedTo !== null) where.require(`${vietnamDate} <= ${where.bind(range.addedTo)}::date`);
}

export function addDocumentDateConditions(where: WhereClause, range: DocumentDateRange): void {
  if (range.occurredFrom !== null) where.require(`record.occurred_on >= ${where.bind(range.occurredFrom)}::date`);
}
