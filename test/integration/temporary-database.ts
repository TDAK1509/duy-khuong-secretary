import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { testDatabaseUrl } from './test-database-url.ts';

export type TemporaryDatabase = {
  url: string;
  openSession: () => Promise<pg.Client>;
  query: <Row extends pg.QueryResultRow>(statement: string) => Promise<Row[]>;
  drop: () => Promise<void>;
};

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const name = `migrate_${randomUUID().replaceAll('-', '')}`;
  await runAs(testDatabaseUrl, (client) => client.query(`CREATE DATABASE ${name}`));
  const url = pointToDatabase(testDatabaseUrl, name);
  const sessions: pg.Client[] = [];
  return {
    url,
    openSession: async () => {
      const session = new pg.Client({ connectionString: url });
      sessions.push(session);
      await session.connect();
      return session;
    },
    query: async <Row extends pg.QueryResultRow>(statement: string) =>
      (await runAs(url, (client) => client.query<Row>(statement))).rows,
    drop: async () => {
      await Promise.all(sessions.map((session) => session.end()));
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
