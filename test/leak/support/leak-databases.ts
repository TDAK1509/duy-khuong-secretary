import { createPostgresPool, type PostgresPool } from '../../../src/providers/database/postgres.ts';

export type LeakDatabases = {
  owner: PostgresPool;
  runtime: PostgresPool;
  close(): Promise<void>;
};

export function openLeakDatabases(environment: NodeJS.ProcessEnv = process.env): LeakDatabases {
  const owner = createPostgresPool(readConnectionUrl(environment, 'OWNER_DATABASE_URL'));
  const runtime = createPostgresPool(readConnectionUrl(environment, 'RUNTIME_DATABASE_URL'));
  return {
    owner,
    runtime,
    close: async () => {
      await Promise.all([owner.end(), runtime.end()]);
    },
  };
}

function readConnectionUrl(environment: NodeJS.ProcessEnv, name: string): string {
  const url = environment[name];
  if (!url) throw new Error(`${name} must be set to a database URL`);
  return url;
}
