import { STANDARD_UNITS } from '../reading/reading.ts';
import type { WhereClause } from './where-clause.ts';

export function buildValidNumberPair(where: WhereClause, detail: string): string {
  const standardUnits = where.bind([...STANDARD_UNITS]);
  return `(jsonb_typeof(${detail} -> 'number') = 'number' AND ${detail} ->> 'unit' = ANY(${standardUnits}::text[]))`;
}
