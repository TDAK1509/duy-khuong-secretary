import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { countLinkedDocuments, relinkEntryToMatchingDocuments } from './link-facts.ts';
import { replaceSlotCompanies } from './knowledge-companies.ts';
import { FACT_COMPANY_SLOTS, pickFactCompanies, type CompanyPicks, type FactCompanySlot, type PickedCompanies, type SlotNames } from './pick-fact-companies.ts';
import type { ReaderService } from '../../services/reading/reader-service.ts';

export type SlotOutcome = { slot: FactCompanySlot; name: string; picked: number | null | 'pending' };

export type RelinkedEntry = { entryId: string; before: number; after: number; slots: SlotOutcome[] };

type EntryToRelink = {
  id: string;
  pickup_name: string | null;
  dropoff_name: string | null;
  pickup_resolved: boolean;
  dropoff_resolved: boolean;
};

const LIST_ENTRIES_SQL = `
  SELECT entry.id, entry.when_pickup_name AS pickup_name, entry.when_dropoff_name AS dropoff_name,
    entry.when_pickup_resolved AS pickup_resolved, entry.when_dropoff_resolved AS dropoff_resolved
  FROM company_knowledge_entries entry WHERE entry.workspace_id = $1 ORDER BY entry.created_at, entry.id`;

class DryRun extends Error {
  readonly result: RelinkedEntry;

  constructor(result: RelinkedEntry) {
    super('dry run');
    this.result = result;
  }
}

export type RelinkRun = { apply: boolean; reader: ReaderService | null };

export async function relinkEntries(database: Database, workspaceId: string, run: RelinkRun): Promise<RelinkedEntry[]> {
  const { rows } = await database.query<EntryToRelink>(LIST_ENTRIES_SQL, [workspaceId]);
  const results: RelinkedEntry[] = [];
  for (const entry of rows) results.push(await relinkEntry(database, workspaceId, entry, run));
  return results;
}

async function relinkEntry(database: Database, workspaceId: string, entry: EntryToRelink, { apply, reader }: RelinkRun): Promise<RelinkedEntry> {
  const names = listUnresolvedNames(entry);
  const picks = apply ? await pickFactCompanies(reader, database, workspaceId, names) : {};
  try {
    return await runInTransaction(database, async (transaction) => {
      const result = await rewriteLinks(transaction, workspaceId, entry.id, { names, picks: apply ? picks : null });
      if (!apply) throw new DryRun(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result;
    throw error;
  }
}

function listUnresolvedNames(entry: EntryToRelink): SlotNames {
  const names: SlotNames = {};
  if (entry.pickup_name !== null && !entry.pickup_resolved) names.pickup = entry.pickup_name;
  if (entry.dropoff_name !== null && !entry.dropoff_resolved) names.dropoff = entry.dropoff_name;
  return names;
}

type EntryRepair = { names: SlotNames; picks: CompanyPicks | null };

async function rewriteLinks(transaction: Transaction, workspaceId: string, entryId: string, { names, picks }: EntryRepair): Promise<RelinkedEntry> {
  await lockWorkspaceRecords(transaction, workspaceId);
  const before = await countLinkedDocuments(transaction, workspaceId, entryId);
  for (const slot of FACT_COMPANY_SLOTS) await storeSlotPicks(transaction, workspaceId, entryId, slot, picks?.[slot]);
  const after = await relinkEntryToMatchingDocuments(transaction, workspaceId, entryId);
  const slots = FACT_COMPANY_SLOTS.flatMap((slot) => describeSlotOutcome(slot, names[slot], picks));
  return { entryId, before, after, slots };
}

async function storeSlotPicks(transaction: Transaction, workspaceId: string, entryId: string, slot: FactCompanySlot, pick: PickedCompanies | undefined): Promise<void> {
  if (pick === undefined) return;
  const marked = await transaction.query(`UPDATE company_knowledge_entries SET when_${slot}_resolved = true WHERE id = $1 AND NOT when_${slot}_resolved RETURNING id`, [entryId]);
  if (marked.length > 0) await replaceSlotCompanies(transaction, workspaceId, entryId, slot, pick.organizationIds);
}

function describeSlotOutcome(slot: FactCompanySlot, name: string | undefined, picks: CompanyPicks | null): SlotOutcome[] {
  if (name === undefined) return [];
  if (picks === null) return [{ slot, name, picked: 'pending' }];
  return [{ slot, name, picked: picks[slot]?.organizationIds.length ?? null }];
}
