import type { Transaction } from '../db/transaction.ts';

export async function insertRow(transaction: Transaction, table: string, values: Record<string, unknown>): Promise<string> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const [row] = await transaction.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    Object.values(values),
  );
  if (!row) throw new Error(`A row was not inserted into ${table}`);
  return row.id;
}

export async function insertRows(transaction: Transaction, table: string, rows: Record<string, unknown>[]): Promise<void> {
  const [first] = rows;
  if (!first) return;
  const columns = Object.keys(first).join(', ');
  const inserted = await transaction.query(
    `INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb) RETURNING 1`,
    [JSON.stringify(rows)],
  );
  if (inserted.length !== rows.length) throw new Error(`Not every row was inserted into ${table}`);
}
