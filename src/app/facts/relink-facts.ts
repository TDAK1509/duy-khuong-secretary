import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { CUSTOMER_VALUE_KEY, type FactCompany } from './fact.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { resolveFactCompany } from './resolve-fact-company.ts';
import { replaceSlotCompanies } from './fact-companies.ts';
import { COMPANY_SLOTS, pickFactCompanies, type CompanyPicks, type CompanySlot, type PickedCompanies, type SlotNames } from './pick-fact-companies.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';

export type SlotOutcome = { slot: CompanySlot; name: string; picked: number | null | 'pending' };

export type RelinkedFact = { factId: string; before: number; after: number; customer: string | null; customerProblem: string | null; slots: SlotOutcome[] };

type FactToRelink = {
  id: string;
  customer_match_key: string | null;
  customer_value: string | null;
  pickup_name: string | null;
  dropoff_name: string | null;
  customer_name: string | null;
  pickup_resolved: boolean;
  dropoff_resolved: boolean;
  customer_resolved: boolean;
};

const LIST_FACTS_SQL = `
  SELECT fact.id, fact.customer_match_key, fact.pickup_name, fact.dropoff_name, fact.customer_name, fact.pickup_resolved, fact.dropoff_resolved, fact.customer_resolved,
    (SELECT value.text_value FROM fact_values value WHERE value.fact_id = fact.id AND value.match_key = '${CUSTOMER_VALUE_KEY}') AS customer_value
  FROM facts fact WHERE fact.workspace_id = $1 ORDER BY fact.created_at, fact.id`;

class DryRun extends Error {
  readonly result: RelinkedFact;

  constructor(result: RelinkedFact) {
    super('dry run');
    this.result = result;
  }
}

export type RelinkRun = { apply: boolean; reader: ReaderService | null };

export async function relinkFacts(database: Database, workspaceId: string, run: RelinkRun): Promise<RelinkedFact[]> {
  const { rows } = await database.query<FactToRelink>(LIST_FACTS_SQL, [workspaceId]);
  const results: RelinkedFact[] = [];
  for (const fact of rows) results.push(await relinkFact(database, workspaceId, fact, run));
  return results;
}

async function relinkFact(database: Database, workspaceId: string, fact: FactToRelink, { apply, reader }: RelinkRun): Promise<RelinkedFact> {
  const customer = await findCustomerToFill(database, workspaceId, fact);
  const names = listUnresolvedNames(fact, customer.company);
  const picks = apply ? await pickFactCompanies(reader, database, workspaceId, names) : {};
  try {
    return await runInTransaction(database, async (transaction) => {
      const result = await rewriteLinks(transaction, workspaceId, fact.id, { customer, names, picks: apply ? picks : null });
      if (!apply) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result;
    throw error;
  }
}

function listUnresolvedNames(fact: FactToRelink, customer: FactCompany | null): SlotNames {
  const names: SlotNames = {};
  if (fact.pickup_name !== null && !fact.pickup_resolved) names.pickup = fact.pickup_name;
  if (fact.dropoff_name !== null && !fact.dropoff_resolved) names.dropoff = fact.dropoff_name;
  const customerName = fact.customer_name ?? customer?.name ?? null;
  if (customerName !== null && !fact.customer_resolved) names.customer = customerName;
  return names;
}

type CustomerToFill = { company: FactCompany | null; problem: string | null };

async function findCustomerToFill(database: Database, workspaceId: string, fact: FactToRelink): Promise<CustomerToFill> {
  const name = fact.customer_value?.trim() ?? '';
  const matchKey = buildMatchKey(name);
  if (fact.customer_match_key !== null || matchKey === '') return { company: null, problem: null };
  const resolution = await resolveFactCompany(database, workspaceId, matchKey);
  if (resolution.kind === 'ambiguous') return { company: null, problem: `customer "${name}" matches ${resolution.organizationNames.join('; ')}` };
  return { company: { name, matchKey: resolution.kind === 'known' ? resolution.matchKey : matchKey, organizationIds: null }, problem: null };
}

type FactRepair = { customer: CustomerToFill; names: SlotNames; picks: CompanyPicks | null };

async function rewriteLinks(transaction: Transaction, workspaceId: string, factId: string, { customer, names, picks }: FactRepair): Promise<RelinkedFact> {
  await lockWorkspaceRecords(transaction, workspaceId);
  const before = await countLinks(transaction, factId);
  if (customer.company !== null) await fillCustomer(transaction, factId, customer.company);
  for (const slot of COMPANY_SLOTS) await storeSlotPicks(transaction, workspaceId, factId, slot, picks?.[slot]);
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  const after = await linkFactToMatchingDocuments(transaction, workspaceId, factId);
  const slots = COMPANY_SLOTS.flatMap((slot) => describeSlotOutcome(slot, names[slot], picks));
  return { factId, before, after, customer: customer.company?.name ?? null, customerProblem: customer.problem, slots };
}

async function storeSlotPicks(transaction: Transaction, workspaceId: string, factId: string, slot: CompanySlot, pick: PickedCompanies | undefined): Promise<void> {
  if (pick === undefined) return;
  const marked = await transaction.query(`UPDATE facts SET ${slot}_resolved = true WHERE id = $1 AND NOT ${slot}_resolved RETURNING id`, [factId]);
  if (marked.length > 0) await replaceSlotCompanies(transaction, workspaceId, factId, slot, pick.organizationIds);
}

function describeSlotOutcome(slot: CompanySlot, name: string | undefined, picks: CompanyPicks | null): SlotOutcome[] {
  if (name === undefined) return [];
  if (picks === null) return [{ slot, name, picked: 'pending' }];
  return [{ slot, name, picked: picks[slot]?.organizationIds.length ?? null }];
}

async function countLinks(transaction: Transaction, factId: string): Promise<number> {
  const [row] = await transaction.query<{ count: number }>('SELECT count(*)::int AS count FROM document_facts WHERE fact_id = $1', [factId]);
  return row?.count ?? 0;
}

async function fillCustomer(transaction: Transaction, factId: string, { name, matchKey }: FactCompany): Promise<void> {
  await transaction.query('UPDATE facts SET customer_name = $2, customer_match_key = $3 WHERE id = $1 AND customer_match_key IS NULL', [factId, name, matchKey]);
}
