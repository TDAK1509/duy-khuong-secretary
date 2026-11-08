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
