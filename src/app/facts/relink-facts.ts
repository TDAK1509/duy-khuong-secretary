import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { linkFactToMatchingDocuments } from './link-facts.ts';
import { replaceSlotCompanies } from './fact-companies.ts';
import { FACT_COMPANY_SLOTS, pickFactCompanies, type CompanyPicks, type FactCompanySlot, type PickedCompanies, type SlotNames } from './pick-fact-companies.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';

export type SlotOutcome = { slot: FactCompanySlot; name: string; picked: number | null | 'pending' };

export type RelinkedFact = { factId: string; before: number; after: number; slots: SlotOutcome[] };

type FactToRelink = {
  id: string;
  pickup_name: string | null;
  dropoff_name: string | null;
  pickup_resolved: boolean;
  dropoff_resolved: boolean;
};

const LIST_FACTS_SQL = `
  SELECT fact.id, fact.pickup_name, fact.dropoff_name, fact.pickup_resolved, fact.dropoff_resolved
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
  const names = listUnresolvedNames(fact);
  const picks = apply ? await pickFactCompanies(reader, database, workspaceId, names) : {};
  try {
    return await runInTransaction(database, async (transaction) => {
      const result = await rewriteLinks(transaction, workspaceId, fact.id, { names, picks: apply ? picks : null });
      if (!apply) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result;
    throw error;
  }
}

function listUnresolvedNames(fact: FactToRelink): SlotNames {
  const names: SlotNames = {};
  if (fact.pickup_name !== null && !fact.pickup_resolved) names.pickup = fact.pickup_name;
  if (fact.dropoff_name !== null && !fact.dropoff_resolved) names.dropoff = fact.dropoff_name;
  return names;
}

type FactRepair = { names: SlotNames; picks: CompanyPicks | null };

async function rewriteLinks(transaction: Transaction, workspaceId: string, factId: string, { names, picks }: FactRepair): Promise<RelinkedFact> {
  await lockWorkspaceRecords(transaction, workspaceId);
  const before = await countLinks(transaction, factId);
  for (const slot of FACT_COMPANY_SLOTS) await storeSlotPicks(transaction, workspaceId, factId, slot, picks?.[slot]);
  await transaction.query('DELETE FROM document_facts WHERE fact_id = $1 AND workspace_id = $2', [factId, workspaceId]);
  const after = await linkFactToMatchingDocuments(transaction, workspaceId, factId);
  const slots = FACT_COMPANY_SLOTS.flatMap((slot) => describeSlotOutcome(slot, names[slot], picks));
  return { factId, before, after, slots };
}

async function storeSlotPicks(transaction: Transaction, workspaceId: string, factId: string, slot: FactCompanySlot, pick: PickedCompanies | undefined): Promise<void> {
  if (pick === undefined) return;
  const marked = await transaction.query(`UPDATE facts SET ${slot}_resolved = true WHERE id = $1 AND NOT ${slot}_resolved RETURNING id`, [factId]);
  if (marked.length > 0) await replaceSlotCompanies(transaction, workspaceId, factId, slot, pick.organizationIds);
}

function describeSlotOutcome(slot: FactCompanySlot, name: string | undefined, picks: CompanyPicks | null): SlotOutcome[] {
  if (name === undefined) return [];
  if (picks === null) return [{ slot, name, picked: 'pending' }];
  return [{ slot, name, picked: picks[slot]?.organizationIds.length ?? null }];
}

async function countLinks(transaction: Transaction, factId: string): Promise<number> {
  const [row] = await transaction.query<{ count: number }>('SELECT count(*)::int AS count FROM document_facts WHERE fact_id = $1', [factId]);
  return row?.count ?? 0;
}
