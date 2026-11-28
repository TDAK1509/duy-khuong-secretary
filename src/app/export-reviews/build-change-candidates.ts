import type { CellSource, RecordedCell } from '../documents/recorded-export.ts';
import type { CellChange } from './list-changed-cells.ts';

export type PaperField = 'date' | 'number' | 'plate' | 'weight' | 'goods' | 'pickup' | 'dropoff' | 'customer';

const OUTCOMES = ['then_customer', 'then_dropoff', 'then_shown_goods_name', 'then_wage_vnd', 'then_rate_vnd_per_ton', 'then_allowance_vnd'] as const;

export type KnowledgeOutcome = (typeof OUTCOMES)[number];

export type KnowledgeWhen = { goods: string | null; pickup_company: string | null; dropoff_company: string | null; vehicle_plate: string | null };

export type PaperCorrection = { document_id: string; field: PaperField; value: string | number };

export type KnowledgeChange = { entry_id: string | null; when: KnowledgeWhen; outcome: KnowledgeOutcome; value: string | number };

export type CandidateAction = { cause: 'paper_reading'; change: PaperCorrection } | { cause: 'company_knowledge'; change: KnowledgeChange };

export type CandidateInput = { change: CellChange; cell: RecordedCell; pickupCompany: string | null };

const NO_WHEN: KnowledgeWhen = { goods: null, pickup_company: null, dropoff_company: null, vehicle_plate: null };

const PAPER_FIELDS: Record<string, PaperField> = {
  document_date: 'date',
  document_number: 'number',
  vehicle_plate: 'plate',
  weight_kg: 'weight',
  goods_line: 'goods',
  issuer_name: 'pickup',
  receiver_name: 'dropoff',
  customer_party: 'customer',
};

const OUTCOMES_OF_PAPER_FIELDS: Record<string, KnowledgeOutcome> = { goods_line: 'then_shown_goods_name', customer_party: 'then_customer', receiver_name: 'then_dropoff' };

const PAPER_FIELDS_OF_OUTCOMES: Record<string, PaperField> = { then_customer: 'customer', then_dropoff: 'dropoff', then_shown_goods_name: 'goods' };

export function buildCandidates(input: CandidateInput): CandidateAction[] {
  const { source } = input.cell;
  if (source === null || !hasUsableValue(input.change)) return [];
  if (source.kind === 'paper') return [...listPaperActions(input, source, PAPER_FIELDS[source.field]), ...listKnowledgeFromPaper(input, source)];
  if (source.kind === 'entry') return listEntryActions(input, source);
  return source.kind === 'computed' ? listFreightActions(input, source) : [];
}

function hasUsableValue({ valueType, after }: CellChange): boolean {
  if (valueType === 'number') return typeof after === 'number' && after >= 0;
  return valueType === 'boolean' ? false : typeof after === 'string' && after !== '';
}

function listPaperActions({ change }: CandidateInput, source: CellSource, field: PaperField | undefined): CandidateAction[] {
  if (field === undefined || source.document_id === undefined || change.after === null || typeof change.after === 'boolean') return [];
  return [{ cause: 'paper_reading', change: { document_id: source.document_id, field, value: change.after } }];
}

function listKnowledgeFromPaper(input: CandidateInput, source: CellSource): CandidateAction[] {
  const outcome = OUTCOMES_OF_PAPER_FIELDS[source.field];
  if (outcome === undefined) return [];
  const goods = outcome === 'then_shown_goods_name' && typeof input.change.before === 'string' ? input.change.before : null;
  return listKnowledgeAdd(input, outcome, { ...NO_WHEN, goods, pickup_company: input.pickupCompany });
}

function listKnowledgeAdd({ change }: CandidateInput, outcome: KnowledgeOutcome, when: KnowledgeWhen): CandidateAction[] {
  const hasCondition = Object.values(when).some((condition) => condition !== null);
  return hasCondition && change.after !== null && typeof change.after !== 'boolean' ? [{ cause: 'company_knowledge', change: { entry_id: null, when, outcome, value: change.after } }] : [];
}

function listEntryActions(input: CandidateInput, source: CellSource): CandidateAction[] {
  if (source.field === 'when_dropoff') return listPaperActions(input, source, 'dropoff');
  if (!(OUTCOMES as readonly string[]).includes(source.field)) return [];
  return [...listKnowledgeOfOutcome(input, source), ...listPaperActions(input, source, PAPER_FIELDS_OF_OUTCOMES[source.field])];
}

function listKnowledgeOfOutcome(input: CandidateInput, source: CellSource): CandidateAction[] {
  const outcome = source.field as KnowledgeOutcome;
  if (source.entry_id === undefined) return listKnowledgeAdd(input, outcome, { ...NO_WHEN, pickup_company: input.pickupCompany });
  return input.change.after === null || typeof input.change.after === 'boolean' ? [] : [{ cause: 'company_knowledge', change: { entry_id: source.entry_id, when: NO_WHEN, outcome, value: input.change.after } }];
}

function listFreightActions(input: CandidateInput, source: CellSource): CandidateAction[] {
  const weightKg = source.snapshot['weight_kg'];
  const rate = typeof weightKg === 'number' && weightKg > 0 && typeof input.change.after === 'number' ? (input.change.after * 1000) / weightKg : null;
  if (source.field !== 'then_rate_vnd_per_ton' || rate === null || !isWhole(rate)) return [];
  return listKnowledgeOfOutcome({ ...input, change: { ...input.change, after: Math.round(rate) } }, source);
}

function isWhole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9;
}
