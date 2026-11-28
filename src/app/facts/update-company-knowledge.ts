import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import { checkWrittenEntry, startCheckedWrite, type WriteChecks, type WriteStop } from './check-knowledge-write.ts';
import { hasCondition, type KnowledgeConditions, type KnowledgeOutcomes, type StoredEntry } from './company-knowledge.ts';
import { buildReplaceEntrySql, listEntryValues } from './entry-columns.ts';
import { joinNewestStatements } from './keep-newest-statements.ts';
import { storeKnowledgeCompanies } from './knowledge-companies.ts';
import { describeNewSide, findSameConditions, readGoodsKey } from './knowledge-identity.ts';
import { relinkEntryToMatchingDocuments } from './link-facts.ts';
import { planReplacingChanges, type OutcomeChange } from './outcome-changes.ts';
import { findEntry } from './select-entries.ts';

export type KnowledgeUpdate = {
  workspaceId: string;
  entryId: string;
  statement: string;
  when: KnowledgeConditions;
  then: KnowledgeOutcomes;
};

export type UpdateKnowledgeResult =
  | { kind: 'updated'; entry: StoredEntry; changes: OutcomeChange[]; sameRouteEntries: StoredEntry[] }
  | { kind: 'same_as_other'; otherEntryId: string }
  | { kind: 'not_found' }
  | { kind: 'stopped'; stop: WriteStop };

type ReplacedKnowledge = { entry: StoredEntry; changes: OutcomeChange[] };

export function updateKnowledge(database: Database, update: KnowledgeUpdate, checks: WriteChecks): Promise<UpdateKnowledgeResult> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, update.workspaceId);
    const stored = await findEntry(transaction, update.workspaceId, update.entryId);
    if (stored === null) return { kind: 'not_found' };
    const twin = await findTwin(transaction, update);
    if (twin !== undefined) return { kind: 'same_as_other', otherEntryId: twin.id };
    await startCheckedWrite(transaction);
    const replaced = await replaceEntry(transaction, update, stored);
    const verdict = await checkWrittenEntry(transaction, { workspaceId: update.workspaceId, entry: replaced.entry, then: update.then, checks });
    return verdict.action === 'passed' ? { kind: 'updated', ...replaced, sameRouteEntries: verdict.sameRouteEntries } : { kind: 'stopped', stop: verdict };
  });
}

async function findTwin(transaction: Transaction, { workspaceId, entryId, when }: KnowledgeUpdate): Promise<StoredEntry | undefined> {
  if (!hasCondition(when)) return undefined;
  const identity = { vehiclePlate: when.vehiclePlate, driverUserId: when.driverUserId, goods: readGoodsKey(when.goods), pickup: describeNewSide(when.pickup), dropoff: describeNewSide(when.dropoff) };
  const matches = await findSameConditions(transaction, workspaceId, identity);
  return matches.find((match) => match.id !== entryId);
}

async function replaceEntry(transaction: Transaction, update: KnowledgeUpdate, stored: StoredEntry): Promise<ReplacedKnowledge> {
  const { workspaceId, entryId, when, then } = update;
  const statement = joinNewestStatements(update.statement, stored.statement);
  await transaction.query(buildReplaceEntrySql(), [entryId, workspaceId, statement, ...listEntryValues(when, then)]);
  await storeKnowledgeCompanies(transaction, workspaceId, entryId, when);
  await relinkEntryToMatchingDocuments(transaction, workspaceId, entryId);
  const entry = await findEntry(transaction, workspaceId, entryId);
  if (entry === null) throw new Error('the updated company knowledge entry disappeared inside its transaction');
  return { entry, changes: planReplacingChanges(stored.outcomes, then) };
}
