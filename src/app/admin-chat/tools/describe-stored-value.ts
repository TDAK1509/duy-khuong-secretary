import type { StoredValue } from '../../facts/plan-value-changes.ts';

export function describeStoredValue(value: StoredValue | null): Record<string, string> | null {
  if (value === null) return null;
  if (value.number !== null && value.unit !== null) return { number: value.number, unit: value.unit };
  return { text: value.text ?? '' };
}
