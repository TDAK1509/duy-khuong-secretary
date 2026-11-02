import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { testDatabaseUrl } from './test-database-url.ts';

const INSUFFICIENT_PRIVILEGE = '42501';
const DROP_ATTEMPTS = 20;
const DROP_RETRY_DELAY_MS = 50;
const RUNTIME_ROLE = 'app_runtime';

export type TemporaryDatabase = {
  url: string;
  runtimeUrl: string;
  openSession: () => Promise<pg.Client>;
  openRuntimeSession: () => Promise<pg.Client>;
  query: <Row extends pg.QueryResultRow>(statement: string) => Promise<Row[]>;
  drop: () => Promise<void>;
};

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const name = `migrate_${randomUUID().replaceAll('-', '')}`;
  await runAs(testDatabaseUrl, (client) => client.query(`CREATE DATABASE ${name}`));
  const url = pointToDatabase(testDatabaseUrl, name);
  const runtimeUrl = signInAs(url, RUNTIME_ROLE);
  const sessions: pg.Client[] = [];
  async function openSessionAt(connectionString: string): Promise<pg.Client> {
    const session = new pg.Client({ connectionString });
    sessions.push(session);
    await session.connect();
    return session;
  }
  return {
    url,
    runtimeUrl,
    openSession: () => openSessionAt(url),
    openRuntimeSession: () => openSessionAt(runtimeUrl),
    query: async <Row extends pg.QueryResultRow>(statement: string) =>
      (await runAs(url, (client) => client.query<Row>(statement))).rows,
    drop: async () => {
      await Promise.all(sessions.map((session) => session.end()));
      await dropDatabase(name);
    },
  };
}

async function dropDatabase(name: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await runAs(testDatabaseUrl, (client) => client.query(`DROP DATABASE ${name} WITH (FORCE)`));
      return;
    } catch (error) {
      if (!isBackgroundWorkerOfAnotherRole(error) || attempt === DROP_ATTEMPTS) throw error;
      await setTimeout(DROP_RETRY_DELAY_MS);
    }
  }
}

// An autovacuum worker runs as the superuser, so this role cannot terminate it. It exits within milliseconds.
function isBackgroundWorkerOfAnotherRole(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === INSUFFICIENT_PRIVILEGE;
}

function signInAs(databaseUrl: string, role: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = role;
  return url.toString();
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
