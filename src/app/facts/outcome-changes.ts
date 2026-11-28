import type { KnowledgeOutcomes } from './company-knowledge.ts';
import { OUTCOME_DEFINITIONS, type OutcomeDefinition } from './knowledge-outcomes.ts';

export type OutcomeValue = string | number;

export type OutcomeChange = { name: string; before: OutcomeValue | null; after: OutcomeValue | null };

export function planKeepingChanges(stored: KnowledgeOutcomes, given: KnowledgeOutcomes): OutcomeChange[] {
  return planReplacingChanges(stored, given).filter((change) => change.after !== null);
}

export function planReplacingChanges(stored: KnowledgeOutcomes, given: KnowledgeOutcomes): OutcomeChange[] {
  const changes = OUTCOME_DEFINITIONS.map((definition) => ({ name: definition.name, before: readOutcomeValue(stored, definition), after: readOutcomeValue(given, definition) }));
  return changes.filter((change) => change.before !== change.after);
}

function readOutcomeValue(outcomes: KnowledgeOutcomes, { key, flagText }: OutcomeDefinition): OutcomeValue | null {
  const value = outcomes[key];
  if (typeof value !== 'boolean') return value;
  return value ? (flagText ?? null) : null;
}
