import type { PostgresPool } from '../../providers/database/postgres.ts';

export type Database = PostgresPool;

export type Transaction = {
  query<Row>(statement: string, values?: unknown[]): Promise<Row[]>;
};

export async function runInTransaction<Result>(
  database: Database,
  work: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await work({
      query: async <Row>(statement: string, values?: unknown[]) =>
        (await client.query(statement, values)).rows as Row[],
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
