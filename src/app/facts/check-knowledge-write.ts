import type { Transaction } from '../db/transaction.ts';
import type { KnowledgeOutcomes, StoredEntry } from './company-knowledge.ts';
import { clearConflicts, findConflicts, type KnowledgeConflict } from './knowledge-conflicts.ts';
import { listOverlappingEntries, listSameRouteEntries, loadOverlapContext, type OverlapContext } from './knowledge-overlap.ts';

export type WriteChecks = { replaceConflicts: boolean; notesChecked: boolean };

export type WriteStop =
  | { action: 'conflict'; conflicts: KnowledgeConflict[] }
  | { action: 'check_notes'; relatedNotes: StoredEntry[] };

export type WriteVerdict = WriteStop | { action: 'passed'; sameRouteEntries: StoredEntry[] };

export type WrittenEntry = { workspaceId: string; entry: StoredEntry; then: KnowledgeOutcomes; checks: WriteChecks };

const WRITE_SAVEPOINT = 'knowledge_write';

export async function startCheckedWrite(transaction: Transaction): Promise<void> {
  await transaction.query(`SAVEPOINT ${WRITE_SAVEPOINT}`);
}

export async function checkWrittenEntry(transaction: Transaction, written: WrittenEntry): Promise<WriteVerdict> {
  const verdict = await decideWrite(transaction, written);
  if (verdict.action !== 'passed') await transaction.query(`ROLLBACK TO SAVEPOINT ${WRITE_SAVEPOINT}`);
  return verdict;
}

async function decideWrite(transaction: Transaction, { workspaceId, entry, then, checks }: WrittenEntry): Promise<WriteVerdict> {
  const context = await loadOverlapContext(transaction, workspaceId, entry);
  const conflicts = await findConflicts(transaction, { workspaceId, entryId: entry.id, then }, listOverlappingEntries(entry, context));
  if (conflicts.length === 0) return checkNotes(entry, context, checks.notesChecked);
  if (!checks.replaceConflicts) return { action: 'conflict', conflicts };
  await clearConflicts(transaction, workspaceId, conflicts);
  return checkNotes(entry, await loadOverlapContext(transaction, workspaceId, entry), checks.notesChecked);
}

function checkNotes(entry: StoredEntry, context: OverlapContext, notesChecked: boolean): WriteVerdict {
  if (notesChecked) return { action: 'passed', sameRouteEntries: listSameRouteEntries(entry, context) };
  const relatedNotes = listOverlappingEntries(entry, context).filter((other) => other.outcomes.note !== null);
  return relatedNotes.length > 0 ? { action: 'check_notes', relatedNotes } : { action: 'passed', sameRouteEntries: [] };
}
