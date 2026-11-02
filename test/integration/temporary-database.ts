import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl } from './test-database-url.ts';

export type TemporaryDatabase = {
  url: string;
  query: <Row extends pg.QueryResultRow>(statement: string) => Promise<Row[]>;
  drop: () => Promise<void>;
};

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const name = `migrate_${randomUUID().replaceAll('-', '')}`;
  await runAs(testDatabaseUrl, (client) => client.query(`CREATE DATABASE ${name}`));
  const url = pointToDatabase(testDatabaseUrl, name);
  return {
    url,
    query: async <Row extends pg.QueryResultRow>(statement: string) =>
      (await runAs(url, (client) => client.query<Row>(statement))).rows,
    drop: async () => {
      await runAs(testDatabaseUrl, (client) => client.query(`DROP DATABASE ${name} WITH (FORCE)`));
    },
  };
}

function pointToDatabase(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function runAs<Result>(
  databaseUrl: string,
  action: (client: pg.Client) => Promise<Result>,
): Promise<Result> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}
