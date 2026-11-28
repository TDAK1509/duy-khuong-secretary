import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { GOODS_VALUE_KEY, type FactCompany, type FactValue, type NewFact } from './fact.ts';
import { joinNewestStatements } from './keep-newest-statements.ts';
import { replaceSlotCompanies, storeFactCompanies } from './fact-companies.ts';
import { FACT_COMPANY_SLOTS, type FactCompanySlot } from './pick-fact-companies.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { applyValueChanges, planValueChanges, type ValueChange } from './plan-value-changes.ts';
import { describeNewSide, findRouteFactTwin, findSameRouteFacts, isRouteIdentity, readGoodsKey, type RouteFact, type RouteIdentity } from './route-fact-identity.ts';

export type SaveFactResult =
  | { action: 'added'; factId: string; linkedDocuments: number }
  | { action: 'updated'; factId: string; linkedDocuments: number; changes: ValueChange[]; restoredSlots: FactCompanySlot[]; stored: RouteFact }
  | { action: 'ambiguous'; candidates: RouteFact[] }
  | { action: 'same_as_other'; otherFactId: string }
  | { action: 'not_same_route' };

const UPDATE_STATEMENT_SQL = 'UPDATE facts SET statement = $3, updated_at = now() WHERE id = $1 AND workspace_id = $2';
const COUNT_LINKS_SQL = 'SELECT count(*)::int AS count FROM document_facts WHERE fact_id = $1 AND workspace_id = $2';

const INSERT_FACT_SQL = `
  INSERT INTO facts (workspace_id, author_user_id, statement, vehicle_plate, driver_user_id, pickup_name, pickup_match_key, dropoff_name, dropoff_match_key, pickup_resolved, dropoff_resolved)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  RETURNING id
`;

const INSERT_VALUE_SQL = `
  INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;

export type SaveOptions = { targetFactId: string | null; updateValues: FactValue[] };

export function saveFact(database: Database, fact: NewFact, { targetFactId, updateValues }: SaveOptions): Promise<SaveFactResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, fact.workspaceId);
    const identity = describeIdentity(fact);
    if (!isRouteIdentity(identity)) return targetFactId === null ? addFact(transaction, fact) : { action: 'not_same_route' };
    if (targetFactId !== null) {
      const target = (await findSameRouteFacts(transaction, fact.workspaceId, { ...identity, goods: null })).find((match) => match.id === targetFactId);
      return target === undefined ? { action: 'not_same_route' } : updateTarget(transaction, { ...fact, values: updateValues }, target);
    }
    const matches = await findSameRouteFacts(transaction, fact.workspaceId, identity.goods === '' ? { ...identity, goods: null } : identity);
    if (matches.length > 1) return { action: 'ambiguous', candidates: matches };
    const [match] = matches;
    return match === undefined ? addFact(transaction, fact) : updateSameRoute(transaction, { ...fact, values: updateValues }, match);
  });
}

function describeIdentity({ scope, values }: NewFact): RouteIdentity {
  return {
    vehiclePlate: scope.vehiclePlate, driverUserId: scope.driverUserId, goods: readGoodsKey(values),
    pickup: describeNewSide(scope.pickup), dropoff: describeNewSide(scope.dropoff),
  };
}

async function addFact(transaction: Transaction, fact: NewFact): Promise<SaveFactResult> {
  const factId = await insertFact(transaction, fact);
  await storeFactCompanies(transaction, fact.workspaceId, factId, fact.scope);
  for (const [position, value] of fact.values.entries()) await insertValue(transaction, fact.workspaceId, factId, position, value);
  const linkedDocuments = await linkFactToMatchingDocuments(transaction, fact.workspaceId, factId);
  return { action: 'added', factId, linkedDocuments };
}

async function updateTarget(transaction: Transaction, fact: NewFact, target: RouteFact): Promise<SaveFactResult> {
  const goodsChanged = fact.values.some((value) => value.matchKey === GOODS_VALUE_KEY) && readGoodsKey(fact.values) !== target.goods;
  const twin = goodsChanged ? await findRouteFactTwin(transaction, fact.workspaceId, target.id, { vehiclePlate: target.vehiclePlate, driverUserId: target.driverUserId, goods: readGoodsKey(fact.values) }) : null;
  return twin === null ? updateSameRoute(transaction, fact, target) : { action: 'same_as_other', otherFactId: twin.id };
}

async function updateSameRoute(transaction: Transaction, fact: NewFact, stored: RouteFact): Promise<SaveFactResult> {
  const factId = stored.id;
  const plan = await planValueChanges(transaction, factId, fact.values, []);
  const changes = plan.changes.filter(isRealChange);
  const restoredSlots = FACT_COMPANY_SLOTS.filter((slot) => !stored[slot].resolved && stored[slot].matchKey !== null && (fact.scope[slot]?.organizationIds?.length ?? 0) > 0);
  if (changes.length > 0) await applyValueChanges(transaction, fact.workspaceId, factId, changes);
  if (changes.length > 0 || restoredSlots.length > 0) await prependStatement(transaction, fact, factId);
  if (restoredSlots.length > 0) await restorePicks(transaction, fact, factId, restoredSlots);
  if (restoredSlots.length > 0 || changes.some((change) => change.matchKey === GOODS_VALUE_KEY)) await relinkFact(transaction, fact.workspaceId, factId);
  const [links] = await transaction.query<{ count: number }>(COUNT_LINKS_SQL, [factId, fact.workspaceId]);
  return { action: 'updated', factId, linkedDocuments: links?.count ?? 0, changes, restoredSlots, stored };
}

async function restorePicks(transaction: Transaction, fact: NewFact, factId: string, slots: FactCompanySlot[]): Promise<void> {
  for (const slot of slots) {
    await replaceSlotCompanies(transaction, fact.workspaceId, factId, slot, fact.scope[slot]?.organizationIds ?? null);
    await transaction.query(`UPDATE facts SET ${slot}_resolved = true WHERE id = $1 AND workspace_id = $2`, [factId, fact.workspaceId]);
  }
}

async function relinkFact(transaction: Transaction, workspaceId: string, factId: string): Promise<void> {
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  await linkFactToMatchingDocuments(transaction, workspaceId, factId);
}

function isRealChange({ before, after }: ValueChange): boolean {
  if (before === null || after === null) return true;
  if (before.number !== null && after.number !== null) return Number(before.number) !== Number(after.number) || before.unit !== after.unit;
  return before.number !== after.number || before.text !== after.text;
}

async function prependStatement(transaction: Transaction, fact: NewFact, factId: string): Promise<void> {
  const [row] = await transaction.query<{ statement: string }>('SELECT statement FROM facts WHERE id = $1 AND workspace_id = $2', [factId, fact.workspaceId]);
  await transaction.query(UPDATE_STATEMENT_SQL, [factId, fact.workspaceId, joinNewestStatements(fact.statement, row?.statement ?? '')]);
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
    isResolved(scope.pickup),
    isResolved(scope.dropoff),
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
