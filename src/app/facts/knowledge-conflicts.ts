import type { Transaction } from '../db/transaction.ts';
import { buildMatchKey } from '../documents/build-match-key.ts';
import type { KnowledgeOutcomes, StoredEntry } from './company-knowledge.ts';
import { OUTCOME_DEFINITIONS, type OutcomeDefinition } from './knowledge-outcomes.ts';
import type { OutcomeValue } from './outcome-changes.ts';

export type KnowledgeConflict = { entry: StoredEntry; key: OutcomeDefinition['key']; name: string; savedValue: OutcomeValue; newValue: OutcomeValue; sharedDocuments: number };

const COMPARED_OUTCOMES = OUTCOME_DEFINITIONS.filter((definition) => definition.key !== 'note');

const COUNT_SHARED_DOCUMENTS_SQL = `
  SELECT other.entry_id::text AS entry_id, count(*)::int AS count
  FROM company_knowledge_links mine
  JOIN company_knowledge_links other ON other.document_id = mine.document_id AND other.workspace_id = mine.workspace_id
  WHERE mine.workspace_id = $1 AND mine.entry_id = $2 AND other.entry_id = ANY($3::uuid[])
  GROUP BY other.entry_id`;

export async function findConflicts(transaction: Transaction, request: { workspaceId: string; entryId: string; then: KnowledgeOutcomes }, overlapping: StoredEntry[]): Promise<KnowledgeConflict[]> {
  const differing = overlapping.filter((entry) => listDifferences(entry.outcomes, request.then).length > 0);
  if (differing.length === 0) return [];
  const shared = await countSharedDocuments(transaction, request.workspaceId, request.entryId, differing);
  return differing.flatMap((entry) => listDifferences(entry.outcomes, request.then).map((difference) => ({ entry, ...difference, sharedDocuments: shared.get(entry.id) ?? 0 })));
}

type Difference = { key: OutcomeDefinition['key']; name: string; savedValue: OutcomeValue; newValue: OutcomeValue };

function listDifferences(saved: KnowledgeOutcomes, given: KnowledgeOutcomes): Difference[] {
  return COMPARED_OUTCOMES.flatMap(({ key, name }) => {
    const savedValue = saved[key];
    const newValue = given[key];
    return savedValue !== null && newValue !== null && !isSameValue(savedValue, newValue) ? [{ key, name, savedValue, newValue }] : [];
  });
}

function isSameValue(saved: OutcomeValue, given: OutcomeValue): boolean {
  return typeof saved === 'string' && typeof given === 'string' ? buildMatchKey(saved) === buildMatchKey(given) : saved === given;
}

async function countSharedDocuments(transaction: Transaction, workspaceId: string, entryId: string, others: StoredEntry[]): Promise<Map<string, number>> {
  const rows = await transaction.query<{ entry_id: string; count: number }>(COUNT_SHARED_DOCUMENTS_SQL, [workspaceId, entryId, others.map((other) => other.id)]);
  return new Map(rows.map((row) => [row.entry_id, row.count]));
}

export async function clearConflicts(transaction: Transaction, workspaceId: string, conflicts: KnowledgeConflict[]): Promise<void> {
  for (const [entry, keys] of groupByEntry(conflicts)) await clearEntryOutcomes(transaction, workspaceId, entry, keys);
}

function groupByEntry(conflicts: KnowledgeConflict[]): Map<StoredEntry, OutcomeDefinition['key'][]> {
  const groups = new Map<StoredEntry, OutcomeDefinition['key'][]>();
  for (const { entry, key } of conflicts) groups.set(entry, [...(groups.get(entry) ?? []), key]);
  return groups;
}

async function clearEntryOutcomes(transaction: Transaction, workspaceId: string, entry: StoredEntry, keys: OutcomeDefinition['key'][]): Promise<void> {
  const keepsOutcome = OUTCOME_DEFINITIONS.some(({ key }) => entry.outcomes[key] !== null && !keys.includes(key));
  if (keepsOutcome) await clearOutcomes(transaction, workspaceId, entry.id, OUTCOME_DEFINITIONS.filter(({ key }) => keys.includes(key)));
  else await transaction.query('DELETE FROM company_knowledge_entries WHERE id = $1 AND workspace_id = $2', [entry.id, workspaceId]);
}

async function clearOutcomes(transaction: Transaction, workspaceId: string, entryId: string, cleared: OutcomeDefinition[]): Promise<void> {
  const assignments = cleared.map(({ column }) => `${column} = NULL`).join(', ');
  await transaction.query(`UPDATE company_knowledge_entries SET ${assignments}, updated_at = now() WHERE id = $1 AND workspace_id = $2`, [entryId, workspaceId]);
}
