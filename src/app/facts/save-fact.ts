import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { FactCompany, FactScope, FactValue, NewFact } from './fact.ts';
import { storeFactCompanies } from './fact-companies.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { applyValueChanges, planValueChanges, type ValueChange } from './plan-value-changes.ts';
import { describeNewSide, findSameRouteFacts, isRouteIdentity, type RouteFact, type RouteIdentity } from './route-fact-identity.ts';

export type SaveFactResult =
  | { action: 'added'; factId: string; linkedDocuments: number }
  | { action: 'updated'; factId: string; linkedDocuments: number; changes: ValueChange[] }
  | { action: 'ambiguous'; candidates: RouteFact[] }
  | { action: 'not_same_route' };

const MAX_STATEMENT_LENGTH = 2000;
const UPDATE_STATEMENT_SQL = 'UPDATE facts SET statement = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2';
const COUNT_LINKS_SQL = 'SELECT count(*)::int AS count FROM document_facts WHERE fact_id = $1 AND workspace_id = $2';

const INSERT_FACT_SQL = `
  INSERT INTO facts (workspace_id, author_user_id, statement, vehicle_plate, driver_user_id, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key, customer_name, customer_match_key,
    pickup_resolved, dropoff_resolved, customer_resolved)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  RETURNING id
`;

const INSERT_VALUE_SQL = `
  INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;

export function saveFact(database: Database, fact: NewFact, targetFactId: string | null): Promise<SaveFactResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, fact.workspaceId);
    const identity = describeIdentity(fact.scope);
    if (!isRouteIdentity(identity)) return targetFactId === null ? addFact(transaction, fact) : { action: 'not_same_route' };
    const matches = await findSameRouteFacts(transaction, fact.workspaceId, identity);
    if (targetFactId !== null) return matches.some((match) => match.id === targetFactId) ? updateSameRoute(transaction, fact, targetFactId) : { action: 'not_same_route' };
    if (matches.length > 1) return { action: 'ambiguous', candidates: matches };
    const [match] = matches;
    return match === undefined ? addFact(transaction, fact) : updateSameRoute(transaction, fact, match.id);
  });
}

function describeIdentity(scope: FactScope): RouteIdentity {
  return { vehiclePlate: scope.vehiclePlate, driverUserId: scope.driverUserId, pickup: describeNewSide(scope.pickup), dropoff: describeNewSide(scope.dropoff), customer: describeNewSide(scope.customer) };
}

async function addFact(transaction: Transaction, fact: NewFact): Promise<SaveFactResult> {
  const factId = await insertFact(transaction, fact);
  await storeFactCompanies(transaction, fact.workspaceId, factId, fact.scope);
  for (const [position, value] of fact.values.entries()) await insertValue(transaction, fact.workspaceId, factId, position, value);
  const linkedDocuments = await linkFactToMatchingDocuments(transaction, fact.workspaceId, factId);
  return { action: 'added', factId, linkedDocuments };
}

async function updateSameRoute(transaction: Transaction, fact: NewFact, factId: string): Promise<SaveFactResult> {
  const plan = await planValueChanges(transaction, factId, fact.values, []);
  const changes = plan.changes.filter(isRealChange);
  if (changes.length > 0) {
    await applyValueChanges(transaction, fact.workspaceId, factId, changes);
    await prependStatement(transaction, fact, factId);
  }
  const [links] = await transaction.query<{ count: number }>(COUNT_LINKS_SQL, [factId, fact.workspaceId]);
  return { action: 'updated', factId, linkedDocuments: links?.count ?? 0, changes };
}

function isRealChange({ before, after }: ValueChange): boolean {
  if (before === null || after === null) return true;
  if (before.number !== null && after.number !== null) return Number(before.number) !== Number(after.number) || before.unit !== after.unit;
  return before.number !== after.number || before.text !== after.text;
}

async function prependStatement(transaction: Transaction, fact: NewFact, factId: string): Promise<void> {
  const [row] = await transaction.query<{ statement: string }>('SELECT statement FROM facts WHERE id = $1 AND workspace_id = $2', [factId, fact.workspaceId]);
  await transaction.query(UPDATE_STATEMENT_SQL, [factId, fact.workspaceId, keepNewestStatements([fact.statement, ...(row?.statement.split('\n') ?? [])])]);
}

function keepNewestStatements(newestFirst: string[]): string {
  const kept: string[] = [];
  for (const line of newestFirst) {
    if ([...kept, line].join('\n').length > MAX_STATEMENT_LENGTH) break;
    kept.push(line);
  }
  return kept.join('\n');
}

async function insertFact(transaction: Transaction, { workspaceId, authorUserId, statement, scope }: NewFact): Promise<string> {
  const [row] = await transaction.query<{ id: string }>(INSERT_FACT_SQL, [
    workspaceId,
    authorUserId,
    statement,
    scope.vehiclePlate,
    scope.driverUserId,
    scope.pickup?.name ?? null,
    scope.pickup?.matchKey ?? null,
    scope.dropoff?.name ?? null,
    scope.dropoff?.matchKey ?? null,
    scope.customer?.name ?? null,
    scope.customer?.matchKey ?? null,
    isResolved(scope.pickup),
    isResolved(scope.dropoff),
    isResolved(scope.customer),
  ]);
  if (row === undefined) throw new Error('inserting a fact returned no row');
  return row.id;
}

function isResolved(company: FactCompany | null): boolean {
  return company !== null && company.organizationIds !== null;
}

async function insertValue(transaction: Transaction, workspaceId: string, factId: string, position: number, { name, matchKey, content }: FactValue): Promise<void> {
  const number = content.kind === 'number' ? content.number : null;
  const unit = content.kind === 'number' ? content.unit : null;
  const text = content.kind === 'text' ? content.text : null;
  await transaction.query(INSERT_VALUE_SQL, [workspaceId, factId, position, name, matchKey, number, unit, text]);
}
