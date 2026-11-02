import { runWithClient, type Database, type DatabaseScope } from './transaction.ts';

export function scopeDatabase(database: Database, scope: DatabaseScope): Database {
  const scoped: Database = {
    scope,
    connect: () => database.connect(),
    query: <Row extends Record<string, unknown>>(statement: string, values?: unknown[]) =>
      runWithClient(scoped, async (client) => {
        const result = await client.query(statement, values);
        return { rows: result.rows as Row[], rowCount: result.rowCount };
      }),
  };
  return scoped;
}
