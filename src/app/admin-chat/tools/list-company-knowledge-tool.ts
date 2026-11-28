import type { AccessScope } from '../../access/access-scope.ts';
import type { Database } from '../../db/transaction.ts';
import type { StoredEntry } from '../../facts/company-knowledge.ts';
import { listKnowledge } from '../../facts/list-company-knowledge.ts';
import { describeThen, describeWhen } from './describe-knowledge.ts';

export async function runListCompanyKnowledge(database: Database, scope: AccessScope): Promise<string> {
  const entries = await listKnowledge(database, scope.workspaceId);
  return JSON.stringify({ entries: entries.map(describeEntry) });
}

function describeEntry(entry: StoredEntry): Record<string, unknown> {
  return {
    entry_id: entry.id,
    statement: entry.statement,
    when: describeWhen(entry),
    then: describeThen(entry.outcomes),
    saved_by: entry.authorName,
    linked_documents: entry.linkedDocuments,
  };
}
