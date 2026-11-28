import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { KnowledgeConditions, NewKnowledge, StoredEntry } from './company-knowledge.ts';
import { buildInsertEntrySql, buildMergeOutcomesSql, listEntryValues, listOutcomeValues } from './entry-columns.ts';
import { joinNewestStatements } from './keep-newest-statements.ts';
import { replaceSlotCompanies, storeKnowledgeCompanies } from './knowledge-companies.ts';
import { describeNewSide, findSameConditions, readGoodsKey, type KnowledgeIdentity } from './knowledge-identity.ts';
import { linkEntryToMatchingDocuments, relinkEntryToMatchingDocuments } from './link-facts.ts';
import { planKeepingChanges, type OutcomeChange } from './outcome-changes.ts';
import { FACT_COMPANY_SLOTS, type FactCompanySlot } from './pick-fact-companies.ts';
import { findEntry } from './select-entries.ts';

export type SaveKnowledgeResult =
  | { action: 'added'; entry: StoredEntry }
  | { action: 'updated'; entry: StoredEntry; changes: OutcomeChange[] }
  | { action: 'ambiguous'; candidates: StoredEntry[] }
  | { action: 'not_same_conditions' };

export function saveKnowledge(database: Database, knowledge: NewKnowledge, targetEntryId: string | null): Promise<SaveKnowledgeResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, knowledge.workspaceId);
    const identity = describeIdentity(knowledge.when, targetEntryId !== null);
    const matches = await findSameConditions(transaction, knowledge.workspaceId, identity);
    if (targetEntryId !== null) return updateTarget(transaction, knowledge, matches.find((match) => match.id === targetEntryId));
    if (matches.length > 1) return { action: 'ambiguous', candidates: matches };
    const [match] = matches;
    return match === undefined ? addEntry(transaction, knowledge) : updateEntry(transaction, knowledge, match);
  });
}

function describeIdentity(when: KnowledgeConditions, hasTarget: boolean): KnowledgeIdentity {
  const goodsKey = readGoodsKey(when.goods);
  const goods = hasTarget || goodsKey === '' ? null : goodsKey;
  return { vehiclePlate: when.vehiclePlate, driverUserId: when.driverUserId, goods, pickup: describeNewSide(when.pickup), dropoff: describeNewSide(when.dropoff) };
}

async function updateTarget(transaction: Transaction, knowledge: NewKnowledge, target: StoredEntry | undefined): Promise<SaveKnowledgeResult> {
  return target === undefined ? { action: 'not_same_conditions' } : updateEntry(transaction, knowledge, target);
}

async function addEntry(transaction: Transaction, knowledge: NewKnowledge): Promise<SaveKnowledgeResult> {
  const entryId = await insertEntry(transaction, knowledge);
  await storeKnowledgeCompanies(transaction, knowledge.workspaceId, entryId, knowledge.when);
  await linkEntryToMatchingDocuments(transaction, knowledge.workspaceId, entryId);
  return { action: 'added', entry: await readEntry(transaction, knowledge.workspaceId, entryId) };
}

async function insertEntry(transaction: Transaction, { workspaceId, authorUserId, statement, when, then }: NewKnowledge): Promise<string> {
  const [row] = await transaction.query<{ id: string }>(buildInsertEntrySql(), [workspaceId, authorUserId, statement, ...listEntryValues(when, then)]);
  if (row === undefined) throw new Error('inserting a company knowledge entry returned no row');
  return row.id;
}

async function updateEntry(transaction: Transaction, knowledge: NewKnowledge, stored: StoredEntry): Promise<SaveKnowledgeResult> {
  const changes = planKeepingChanges(stored.outcomes, knowledge.then);
  const restoredSlots = listRestoredSlots(stored, knowledge.when);
  if (changes.length > 0 || restoredSlots.length > 0) await mergeOutcomes(transaction, knowledge, stored);
  if (restoredSlots.length > 0) await restorePicks(transaction, knowledge, { entryId: stored.id, slots: restoredSlots });
  return { action: 'updated', entry: await readEntry(transaction, knowledge.workspaceId, stored.id), changes };
}

async function readEntry(transaction: Transaction, workspaceId: string, entryId: string): Promise<StoredEntry> {
  const entry = await findEntry(transaction, workspaceId, entryId);
  if (entry === null) throw new Error('the saved company knowledge entry disappeared inside its transaction');
  return entry;
}

function listRestoredSlots(stored: StoredEntry, when: KnowledgeConditions): FactCompanySlot[] {
  return FACT_COMPANY_SLOTS.filter((slot) => !stored.sides[slot].resolved && stored.sides[slot].matchKey !== null && (when[slot]?.organizationIds?.length ?? 0) > 0);
}

async function mergeOutcomes(transaction: Transaction, { workspaceId, statement, then }: NewKnowledge, stored: StoredEntry): Promise<void> {
  const joinedStatement = joinNewestStatements(statement, stored.statement);
  await transaction.query(buildMergeOutcomesSql(), [stored.id, workspaceId, joinedStatement, ...listOutcomeValues(then)]);
}

type RestoredPicks = { entryId: string; slots: FactCompanySlot[] };

async function restorePicks(transaction: Transaction, { workspaceId, when }: NewKnowledge, { entryId, slots }: RestoredPicks): Promise<void> {
  for (const slot of slots) {
    await replaceSlotCompanies(transaction, workspaceId, entryId, slot, when[slot]?.organizationIds ?? null);
    await transaction.query(`UPDATE company_knowledge_entries SET when_${slot}_resolved = true WHERE id = $1 AND workspace_id = $2`, [entryId, workspaceId]);
  }
  await relinkEntryToMatchingDocuments(transaction, workspaceId, entryId);
}
