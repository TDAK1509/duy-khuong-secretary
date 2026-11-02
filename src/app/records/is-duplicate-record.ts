import type { NewRecord } from './new-record.ts';

export type DuplicateFields = Pick<
  NewRecord,
  'category' | 'maintenanceItem' | 'vehiclePlate' | 'documentNumber' | 'occurredOn' | 'amountVnd' | 'identifiers' | 'details'
>;

export function isDuplicateRecord(existing: DuplicateFields, candidate: DuplicateFields): boolean {
  return existing.category === candidate.category && existing.documentNumber === candidate.documentNumber;
}
