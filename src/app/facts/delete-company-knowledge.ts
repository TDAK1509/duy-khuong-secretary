import { runInTransaction, type Database } from '../db/transaction.ts';
import { lockWorkspaceRecords } from '../records/lock-workspace-records.ts';
import type { StoredEntry } from './company-knowledge.ts';
import { findEntry } from './select-entries.ts';

export function deleteKnowledge(database: Database, workspaceId: string, entryId: string): Promise<StoredEntry | null> {
  return runInTransaction(database, async (transaction) => {
    await lockWorkspaceRecords(transaction, workspaceId);
    const entry = await findEntry(transaction, workspaceId, entryId);
    if (entry === null) return null;
    await transaction.query('DELETE FROM company_knowledge_entries WHERE id = $1 AND workspace_id = $2', [entryId, workspaceId]);
    return entry;
  });
}
