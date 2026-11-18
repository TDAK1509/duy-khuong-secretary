import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { CUSTOMER_VALUE_KEY, type FactCompany } from './fact.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { resolveFactCompany } from './resolve-fact-company.ts';

export type RelinkedFact = { factId: string; before: number; after: number; customer: string | null; customerProblem: string | null };

type FactToRelink = { id: string; customer_match_key: string | null; customer_value: string | null };

const LIST_FACTS_SQL = `
  SELECT fact.id, fact.customer_match_key,
    (SELECT value.text_value FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${CUSTOMER_VALUE_KEY}') AS customer_value
  FROM facts fact WHERE fact.workspace_id = $1 ORDER BY fact.created_at, fact.id`;

class DryRun extends Error {
  readonly result: RelinkedFact;

  constructor(result: RelinkedFact) {
    super('dry run');
    this.result = result;
  }
}

export async function relinkFacts(database: Database, workspaceId: string, apply: boolean): Promise<RelinkedFact[]> {
  const { rows } = await database.query<FactToRelink>(LIST_FACTS_SQL, [workspaceId]);
  const results: RelinkedFact[] = [];
  for (const fact of rows) results.push(await relinkFact(database, workspaceId, fact, apply));
  return results;
}

async function relinkFact(database: Database, workspaceId: string, fact: FactToRelink, apply: boolean): Promise<RelinkedFact> {
  const customer = await findCustomerToFill(database, workspaceId, fact);
  try {
    return await runInTransaction(database, async (transaction) => {
      const result = await rewriteLinks(transaction, workspaceId, fact.id, customer);
      if (!apply) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result;
    throw error;
  }
}

type CustomerToFill = { company: FactCompany | null; problem: string | null };

async function findCustomerToFill(database: Database, workspaceId: string, fact: FactToRelink): Promise<CustomerToFill> {
  const name = fact.customer_value?.trim() ?? '';
  const matchKey = buildMatchKey(name);
  if (fact.customer_match_key !== null || matchKey === '') return { company: null, problem: null };
  const resolution = await resolveFactCompany(database, workspaceId, matchKey);
  if (resolution.kind === 'ambiguous') return { company: null, problem: `customer "${name}" matches ${resolution.organizationNames.join('; ')}` };
  return { company: { name, matchKey: resolution.kind === 'known' ? resolution.matchKey : matchKey }, problem: null };
}

async function rewriteLinks(transaction: Transaction, workspaceId: string, factId: string, customer: CustomerToFill): Promise<RelinkedFact> {
  await lockWorkspaceRecords(transaction, workspaceId);
  const before = await countLinks(transaction, factId);
  if (customer.company !== null) await fillCustomer(transaction, factId, customer.company);
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  const after = await linkFactToMatchingDocuments(transaction, workspaceId, factId);
  return { factId, before, after, customer: customer.company?.name ?? null, customerProblem: customer.problem };
}

async function countLinks(transaction: Transaction, factId: string): Promise<number> {
  const [row] = await transaction.query<{ count: number }>('SELECT count(*)::int AS count FROM document_facts WHERE fact_id = $1', [factId]);
  return row?.count ?? 0;
}

async function fillCustomer(transaction: Transaction, factId: string, { name, matchKey }: FactCompany): Promise<void> {
  await transaction.query('UPDATE facts SET customer_name = $2, customer_match_key = $3 WHERE id = $1 AND customer_match_key IS NULL', [factId, name, matchKey]);
}
