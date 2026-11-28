import { runInTransaction, type Database } from '../db/transaction.ts';
import type { StoredEntry } from './company-knowledge.ts';
import { selectEntries } from './select-entries.ts';

export function listKnowledge(database: Database, workspaceId: string): Promise<StoredEntry[]> {
  return runInTransaction(database, (transaction) => selectEntries(transaction, { where: 'entry.workspace_id = $1', values: [workspaceId] }));
}
