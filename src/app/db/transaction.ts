export type DatabaseScope = { workspaceId: string; ownerUserId?: string };

export type QueryResult<Row> = { rows: Row[]; rowCount: number | null };

export type DatabaseClient = {
  query(statement: string, values?: unknown[]): Promise<QueryResult<unknown>>;
  release(): void;
};

export type Database = {
  scope?: DatabaseScope;
  connect(): Promise<DatabaseClient>;
  query<Row extends Record<string, unknown>>(statement: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

export type Transaction = {
  query<Row>(statement: string, values?: unknown[]): Promise<Row[]>;
};

export function runInTransaction<Result>(
  database: Database,
  work: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  return runWithClient(database, (client) =>
    work({ query: async <Row>(statement: string, values?: unknown[]) => (await client.query(statement, values)).rows as Row[] }),
  );
}

export async function runWithClient<Result>(
  database: Database,
  work: (client: DatabaseClient) => Promise<Result>,
): Promise<Result> {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    if (database.scope) await applyScope(client, database.scope);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function applyScope(client: DatabaseClient, scope: DatabaseScope): Promise<void> {
  await client.query(`SELECT set_config('app.workspace_id', $1, true), set_config('app.owner_user_id', $2, true)`, [
    scope.workspaceId,
    scope.ownerUserId ?? '',
  ]);
}
