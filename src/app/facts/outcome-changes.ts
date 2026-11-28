import type { KnowledgeOutcomes } from './company-knowledge.ts';
import { OUTCOME_DEFINITIONS } from './knowledge-outcomes.ts';

export type OutcomeValue = string | number;

export type OutcomeChange = { name: string; before: OutcomeValue | null; after: OutcomeValue | null };

export function planKeepingChanges(stored: KnowledgeOutcomes, given: KnowledgeOutcomes): OutcomeChange[] {
  return planReplacingChanges(stored, given).filter((change) => change.after !== null);
}

export function planReplacingChanges(stored: KnowledgeOutcomes, given: KnowledgeOutcomes): OutcomeChange[] {
  const changes = OUTCOME_DEFINITIONS.map(({ key, name }) => ({ name, before: stored[key], after: given[key] }));
  return changes.filter((change) => change.before !== change.after);
}
