import type { KnowledgeCompany, KnowledgeConditions, KnowledgeOutcomes } from './company-knowledge.ts';

const CONDITION_COLUMNS = [
  'when_goods', 'when_vehicle_plate', 'when_driver_user_id',
  'when_pickup_name', 'when_pickup_match_key', 'when_pickup_resolved',
  'when_dropoff_name', 'when_dropoff_match_key', 'when_dropoff_resolved',
];

const OUTCOME_COLUMNS = ['then_customer', 'then_dropoff', 'then_shown_goods_name', 'then_wage_vnd', 'then_rate_vnd_per_ton', 'then_allowance_vnd', 'then_equal_weights', 'then_note'];

const ENTRY_COLUMNS = [...CONDITION_COLUMNS, ...OUTCOME_COLUMNS];

export function listEntryValues(conditions: KnowledgeConditions, outcomes: KnowledgeOutcomes): unknown[] {
  return [...listConditionValues(conditions), ...listOutcomeValues(outcomes)];
}

export function listConditionValues({ goods, vehiclePlate, driverUserId, pickup, dropoff }: KnowledgeConditions): unknown[] {
  return [goods, vehiclePlate, driverUserId, ...listCompanyValues(pickup), ...listCompanyValues(dropoff)];
}

function listCompanyValues(company: KnowledgeCompany | null): unknown[] {
  return [company?.name ?? null, company?.matchKey ?? null, company !== null && company.organizationIds !== null];
}

export function listOutcomeValues({ customer, dropoff, shownGoodsName, wageVnd, ratePerTonVnd, allowanceVnd, equalWeights, note }: KnowledgeOutcomes): unknown[] {
  return [customer, dropoff, shownGoodsName, wageVnd, ratePerTonVnd, allowanceVnd, equalWeights, note];
}

export function buildInsertEntrySql(): string {
  const placeholders = ENTRY_COLUMNS.map((_, index) => `$${index + 4}`);
  return `INSERT INTO company_knowledge_entries (workspace_id, author_user_id, statement, ${ENTRY_COLUMNS.join(', ')}) VALUES ($1, $2, $3, ${placeholders.join(', ')}) RETURNING id`;
}

export function buildReplaceEntrySql(): string {
  const assignments = ENTRY_COLUMNS.map((column, index) => `${column} = $${index + 4}`);
  return `UPDATE company_knowledge_entries SET statement = $3, ${assignments.join(', ')}, updated_at = now() WHERE id = $1 AND workspace_id = $2`;
}

export function buildMergeOutcomesSql(): string {
  const assignments = OUTCOME_COLUMNS.map((column, index) => buildKeepingAssignment(column, index + 4));
  return `UPDATE company_knowledge_entries SET statement = $3, ${assignments.join(', ')}, updated_at = now() WHERE id = $1 AND workspace_id = $2`;
}

function buildKeepingAssignment(column: string, parameter: number): string {
  if (column === 'then_equal_weights') return `${column} = ${column} OR $${parameter}`;
  return `${column} = coalesce($${parameter}, ${column})`;
}
