import type { Transaction } from '../db/transaction.ts';
import type { FactValue, FactValueContent } from './fact.ts';

export type StoredValue = { number: string | null; unit: string | null; text: string | null };

export type ValueChange = { name: string; matchKey: string; before: StoredValue | null; after: StoredValue | null };

export type ValuePlan = { changes: ValueChange[]; missingKeys: string[]; remainingCount: number };

type ValueRow = StoredValue & { name: string; match_key: string };

const LOAD_VALUES_SQL = 'SELECT name, match_key, number::text AS number, unit, text_value AS text FROM fact_values WHERE fact_id = $1';
const DELETE_VALUE_SQL = 'DELETE FROM fact_values WHERE fact_id = $1 AND match_key = $2';
const UPDATE_VALUE_SQL = 'UPDATE fact_values SET number = $3, unit = $4, text_value = $5 WHERE fact_id = $1 AND match_key = $2';
const INSERT_VALUE_SQL = `
  INSERT INTO fact_values (workspace_id, fact_id, position, name, match_key, number, unit, text_value)
  SELECT $1, $2, COALESCE(max(position) + 1, 0), $3, $4, $5, $6, $7 FROM fact_values WHERE fact_id = $2
`;

export async function planValueChanges(transaction: Transaction, factId: string, setValues: FactValue[], removeKeys: string[]): Promise<ValuePlan> {
  const stored = new Map((await transaction.query<ValueRow>(LOAD_VALUES_SQL, [factId])).map((row) => [row.match_key, row]));
  const setChanges = setValues.map((value) => planSetChange(value, stored.get(value.matchKey)));
  const removable = removeKeys.flatMap((key) => stored.get(key) ?? []);
  const removeChanges = removable.map((row) => ({ name: row.name, matchKey: row.match_key, before: pickStored(row), after: null }));
  const missingKeys = removeKeys.filter((key) => !stored.has(key));
  const added = setChanges.filter((change) => change.before === null).length;
  return { changes: [...setChanges, ...removeChanges], missingKeys, remainingCount: stored.size + added - removable.length };
}

function planSetChange(value: FactValue, storedRow: ValueRow | undefined): ValueChange {
  return { name: storedRow?.name ?? value.name, matchKey: value.matchKey, before: pickStored(storedRow), after: toStoredValue(value.content) };
}

function pickStored(row: ValueRow | undefined): StoredValue | null {
  return row === undefined ? null : { number: row.number, unit: row.unit, text: row.text };
}

function toStoredValue(content: FactValueContent): StoredValue {
  if (content.kind === 'number') return { number: String(content.number), unit: content.unit, text: null };
  return { number: null, unit: null, text: content.text };
}

export async function applyValueChanges(transaction: Transaction, workspaceId: string, factId: string, changes: ValueChange[]): Promise<void> {
  for (const change of changes) await applyValueChange(transaction, workspaceId, factId, change);
}

async function applyValueChange(transaction: Transaction, workspaceId: string, factId: string, { name, matchKey, before, after }: ValueChange): Promise<void> {
  if (after === null) await transaction.query(DELETE_VALUE_SQL, [factId, matchKey]);
  else if (before === null) await transaction.query(INSERT_VALUE_SQL, [workspaceId, factId, name, matchKey, after.number, after.unit, after.text]);
  else await transaction.query(UPDATE_VALUE_SQL, [factId, matchKey, after.number, after.unit, after.text]);
}
