import { STANDARD_UNITS } from '../reading/reading.ts';
import type { WhereClause } from './where-clause.ts';

export function buildValidNumberPair(where: WhereClause, detail: string): string {
  const standardUnits = where.bind([...STANDARD_UNITS]);
  const isNonNegativeNumber = `CASE WHEN jsonb_typeof(${detail} -> 'number') = 'number' THEN (${detail} -> 'number')::numeric >= 0 END`;
  return `(${isNonNegativeNumber} AND ${detail} ->> 'unit' = ANY(${standardUnits}::text[]))`;
}
