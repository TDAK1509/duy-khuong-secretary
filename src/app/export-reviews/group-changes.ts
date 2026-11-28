import type { ReviewChange } from './review-changes.ts';

export type ChangeGroup = { changes: ReviewChange[] };

export function groupChanges(changes: ReviewChange[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const change of changes) {
    const key = describeGroupKey(change);
    groups.set(key, { changes: [...(groups.get(key)?.changes ?? []), change] });
  }
  return [...groups.values()];
}

export function findGroupOf(changes: ReviewChange[], target: ReviewChange): ChangeGroup {
  return { changes: changes.filter((change) => describeGroupKey(change) === describeGroupKey(target)) };
}

function describeGroupKey(change: ReviewChange): string {
  const knowledge = change.candidates.find((action) => action.cause === 'company_knowledge');
  if (knowledge === undefined || change.status !== 'pending') return change.id;
  return JSON.stringify([change.columnKey, change.before, change.after, knowledge.change]);
}
