import { buildDetailKey } from '../reading/build-detail-key.ts';
import { toAccentFreeForm } from '../reading/normalize.ts';
import type { NewRecord } from './new-record.ts';

export type DuplicateFields = Pick<
  NewRecord,
  'category' | 'maintenanceItem' | 'vehiclePlate' | 'documentNumber' | 'occurredOn' | 'amountVnd' | 'identifiers' | 'details'
>;

export function isDuplicateRecord(existing: DuplicateFields, candidate: DuplicateFields): boolean {
  return (
    existing.category === candidate.category &&
    toAccentFreeForm(existing.maintenanceItem) === toAccentFreeForm(candidate.maintenanceItem) &&
    existing.documentNumber === candidate.documentNumber &&
    existing.amountVnd === candidate.amountVnd &&
    existing.occurredOn === candidate.occurredOn &&
    existing.vehiclePlate === candidate.vehiclePlate &&
    isSameSet(existing.identifiers, candidate.identifiers) &&
    haveSameDetails(existing, candidate)
  );
}

function haveSameDetails(existing: DuplicateFields, candidate: DuplicateFields): boolean {
  return isSameSet(existing.details.map(buildDetailKey), candidate.details.map(buildDetailKey));
}

function isSameSet(first: string[], second: string[]): boolean {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  return firstSet.size === secondSet.size && [...firstSet].every((value) => secondSet.has(value));
}
