import type { WriteStop } from '../../facts/check-knowledge-write.ts';
import type { KnowledgeConflict } from '../../facts/knowledge-conflicts.ts';
import type { KnowledgeOutcomes, StoredEntry } from '../../facts/company-knowledge.ts';
import type { ExampleDocument } from '../../facts/list-example-documents.ts';
import type { OutcomeChange } from '../../facts/outcome-changes.ts';

export type MatchedCompanies = { pickup: string | null; dropoff: string | null };

export function describeWhenWithMatches(entry: StoredEntry, matched: MatchedCompanies): Record<string, string | null> {
  return { ...describeWhen(entry), pickup_company_matched: matched.pickup, dropoff_company_matched: matched.dropoff };
}

export function describeCandidate(entry: StoredEntry): Record<string, unknown> {
  return { entry_id: entry.id, when: describeWhen(entry), then: describeThen(entry.outcomes) };
}

export function describeWhen(entry: StoredEntry): Record<string, string | null> {
  return {
    goods: entry.goods,
    vehicle_plate: entry.vehiclePlate,
    driver: entry.driverName,
    pickup_company: entry.sides.pickup.name,
    dropoff_company: entry.sides.dropoff.name,
  };
}

export function describeThen({ customer, dropoff, shownGoodsName, wageVnd, ratePerTonVnd, allowanceVnd, equalWeights, note }: KnowledgeOutcomes): Record<string, string | number | boolean | null> {
  return { customer, dropoff, shown_goods_name: shownGoodsName, wage_vnd: wageVnd, rate_vnd_per_ton: ratePerTonVnd, allowance_vnd: allowanceVnd, equal_weights: equalWeights, note };
}

export function describeChange({ name, before, after }: OutcomeChange): Record<string, unknown> {
  return { kind: before === null ? 'added' : 'replaced', name, before, after };
}

export function describeExampleDocument({ kind, title, documentNumber, documentDate, vehiclePlate }: ExampleDocument): Record<string, string> {
  const fields = { kind, title, document_number: documentNumber, document_date: documentDate, vehicle_plate: vehiclePlate };
  return Object.fromEntries(Object.entries(fields).filter((field): field is [string, string] => field[1] !== null));
}

export function describeWriteStop(stop: WriteStop): string {
  if (stop.action === 'conflict') return JSON.stringify({ ok: true, action: 'conflict', conflicts: stop.conflicts.map(describeConflict) });
  return JSON.stringify({ ok: true, action: 'check_notes', related_notes: stop.relatedNotes.map(describeRelatedNote) });
}

export function describeConflict({ entry, name, savedValue, newValue, sharedDocuments }: KnowledgeConflict): Record<string, unknown> {
  return { entry_id: entry.id, when: describeWhen(entry), outcome: name, saved_value: savedValue, new_value: newValue, shared_documents: sharedDocuments };
}

export function describeRelatedNote(entry: StoredEntry): Record<string, unknown> {
  return { entry_id: entry.id, when: describeWhen(entry), note: entry.outcomes.note, author: entry.authorName };
}
