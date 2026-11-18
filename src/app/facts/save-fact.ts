import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { FactCompany, FactValue, NewFact } from './fact.ts';
import { storeFactCompanies } from './fact-companies.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';

export type SavedFact = { factId: string; linkedDocuments: number };

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

export function saveFact(database: Database, fact: NewFact): Promise<SavedFact> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, fact.workspaceId);
    const factId = await insertFact(transaction, fact);
    await storeFactCompanies(transaction, fact.workspaceId, factId, fact.scope);
    for (const [position, value] of fact.values.entries()) await insertValue(transaction, fact.workspaceId, factId, position, value);
    const linkedDocuments = await linkFactToMatchingDocuments(transaction, fact.workspaceId, factId);
    return { factId, linkedDocuments };
  });
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
