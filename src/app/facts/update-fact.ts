import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { FactValue } from './fact.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { applyValueChanges, planValueChanges, type ValueChange } from './plan-value-changes.ts';
import { findRouteFactTwin } from './route-fact-identity.ts';
import { joinNewestStatements } from './keep-newest-statements.ts';


export type ScopeChange = {
  vehiclePlate?: string | null;
  driverUserId?: string | null;
};

export type FactUpdate = {
  workspaceId: string;
  factId: string;
  changeStatement: string;
  setValues: FactValue[];
  removeValueKeys: string[];
  scopeChange: ScopeChange;
};

export type UpdatedScope = { vehiclePlate: string | null; driverName: string | null; pickupName: string | null; dropoffName: string | null; customerName: string | null };

export type FactUpdateResult =
  | { kind: 'updated'; changes: ValueChange[]; missingValueKeys: string[]; scope: UpdatedScope; linkedDocuments: number }
  | { kind: 'same_as_other'; otherFactId: string }
  | { kind: 'not_found' | 'no_values_left' | 'no_scope_left' };

type FactRow = {
  statement: string;
  vehicle_plate: string | null;
  driver_user_id: string | null;
  pickup_name: string | null;
  pickup_match_key: string | null;
  dropoff_name: string | null;
  dropoff_match_key: string | null;
  customer_name: string | null;
  customer_match_key: string | null;
  pickup_resolved: boolean;
  dropoff_resolved: boolean;
  customer_resolved: boolean;
};

const LOAD_FACT_SQL = `
  SELECT statement, vehicle_plate, driver_user_id, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key, customer_name, customer_match_key,
    pickup_resolved, dropoff_resolved, customer_resolved
  FROM facts WHERE id = $1 AND workspace_id = $2
  FOR UPDATE
`;

const UPDATE_FACT_SQL = `
  UPDATE facts
  SET statement = $3, vehicle_plate = $4, driver_user_id = $5, pickup_name = $6, pickup_match_key = $7,
      dropoff_name = $8, dropoff_match_key = $9, customer_name = $10, customer_match_key = $11,
      pickup_resolved = $12, dropoff_resolved = $13, customer_resolved = $14, updated_at = now()
  WHERE id = $1 AND workspace_id = $2
`;

const LOAD_SCOPE_SQL = `
  SELECT fact.vehicle_plate, driver.display_name AS driver_name, fact.pickup_name, fact.dropoff_name, fact.customer_name,
    (SELECT count(*) FROM document_facts link WHERE link.fact_id = fact.id)::int AS linked_documents
  FROM facts fact
  LEFT JOIN memberships driver ON driver.workspace_id = fact.workspace_id AND driver.user_id = fact.driver_user_id
  WHERE fact.id = $1 AND fact.workspace_id = $2
`;

export async function hasFact(database: Database, workspaceId: string, factId: string): Promise<boolean> {
  const { rows } = await database.query('SELECT 1 FROM facts WHERE id = $1 AND workspace_id = $2', [factId, workspaceId]);
  return rows.length > 0;
}

export function updateFact(database: Database, update: FactUpdate): Promise<FactUpdateResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, update.workspaceId);
    const [fact] = await transaction.query<FactRow>(LOAD_FACT_SQL, [update.factId, update.workspaceId]);
    if (fact === undefined) return { kind: 'not_found' };
    return updateLoadedFact(transaction, update, fact);
  });
}

async function updateLoadedFact(transaction: Transaction, update: FactUpdate, fact: FactRow): Promise<FactUpdateResult> {
  const valuePlan = await planValueChanges(transaction, update.factId, update.setValues, update.removeValueKeys);
  if (valuePlan.remainingCount === 0) return { kind: 'no_values_left' };
  const next = mergeScope(fact, update.scopeChange, joinNewestStatements(update.changeStatement, fact.statement));
  if (hasNoScope(next)) return { kind: 'no_scope_left' };
  const twin = hasScopeChanged(fact, next) ? await findRouteFactTwin(transaction, update.workspaceId, update.factId, { vehiclePlate: next.vehicle_plate, driverUserId: next.driver_user_id }) : null;
  if (twin !== null) return { kind: 'same_as_other', otherFactId: twin.id };
  await applyValueChanges(transaction, update.workspaceId, update.factId, valuePlan.changes);
  await writeFactRow(transaction, update, next);
  if (hasScopeChanged(fact, next)) await relinkDocuments(transaction, update.workspaceId, update.factId);
  return { kind: 'updated', changes: valuePlan.changes, missingValueKeys: valuePlan.missingKeys, ...(await loadScope(transaction, update)) };
}

function mergeScope(fact: FactRow, change: ScopeChange, statement: string): FactRow {
  return {
    ...fact,
    statement,
    vehicle_plate: change.vehiclePlate === undefined ? fact.vehicle_plate : change.vehiclePlate,
    driver_user_id: change.driverUserId === undefined ? fact.driver_user_id : change.driverUserId,
  };
}

function hasNoScope(fact: FactRow): boolean {
  return [fact.vehicle_plate, fact.driver_user_id, fact.pickup_match_key, fact.dropoff_match_key].every((part) => part === null);
}

async function writeFactRow(transaction: Transaction, { factId, workspaceId }: FactUpdate, next: FactRow): Promise<void> {
  await transaction.query(UPDATE_FACT_SQL, [
    factId,
    workspaceId,
    next.statement,
    next.vehicle_plate,
    next.driver_user_id,
    next.pickup_name,
    next.pickup_match_key,
    next.dropoff_name,
    next.dropoff_match_key,
    next.customer_name,
    next.customer_match_key,
    next.pickup_resolved,
    next.dropoff_resolved,
    next.customer_resolved,
  ]);
}

function hasScopeChanged(before: FactRow, after: FactRow): boolean {
  const keys = ['vehicle_plate', 'driver_user_id'] as const;
  return keys.some((key) => before[key] !== after[key]);
}

async function relinkDocuments(transaction: Transaction, workspaceId: string, factId: string): Promise<void> {
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  await linkFactToMatchingDocuments(transaction, workspaceId, factId);
}

async function loadScope(transaction: Transaction, { factId, workspaceId }: FactUpdate): Promise<{ scope: UpdatedScope; linkedDocuments: number }> {
  const [row] = await transaction.query<{ vehicle_plate: string | null; driver_name: string | null; pickup_name: string | null; dropoff_name: string | null; customer_name: string | null; linked_documents: number }>(LOAD_SCOPE_SQL, [factId, workspaceId]);
  if (row === undefined) throw new Error('the updated fact disappeared inside its transaction');
  return { scope: { vehiclePlate: row.vehicle_plate, driverName: row.driver_name, pickupName: row.pickup_name, dropoffName: row.dropoff_name, customerName: row.customer_name }, linkedDocuments: row.linked_documents };
}
