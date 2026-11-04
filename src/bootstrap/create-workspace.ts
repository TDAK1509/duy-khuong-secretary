import { z } from 'zod';
import { createWorkspaceWithFirstAdminInvite } from '../app/workspaces/create-workspace.ts';
import { formatVietnamDateTime } from '../app/workspaces/format-expiry.ts';
import { readRuntimeDatabaseUrl } from './config.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';

export type CreateWorkspaceOptions = {
  log?: (line: string) => void;
  now?: () => Date;
};

export async function runCreateWorkspaceCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: CreateWorkspaceOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) {
    log('DATABASE_URL must be set to a database URL');
    return 1;
  }
  const pool = createPostgresPool(databaseUrl.data);
  try {
    return await createAndReport(pool, args, options.now ?? (() => new Date()), log);
  } finally {
    await pool.end();
  }
}

async function createAndReport(
  pool: PostgresPool,
  args: string[],
  now: () => Date,
  log: (line: string) => void,
): Promise<number> {
  const [workspaceName = '', adminName = ''] = args;
  const result = await createWorkspaceWithFirstAdminInvite(pool, { workspaceName, adminName }, now());
  if (result.kind === 'invalid') {
    log(result.field === 'workspace_name' ? 'Invalid workspace name.' : 'Invalid admin name.');
    return 1;
  }
  log(`Workspace "${result.workspaceName}" created: ${result.workspaceId}`);
  log(
    `First admin invite for ${adminName.trim()}: ${result.inviteCode} (valid until ${formatVietnamDateTime(result.expiresAt)})`,
  );
  return 0;
}

if (import.meta.main) {
  process.exitCode = await runCreateWorkspaceCommand(process.argv.slice(2), process.env);
}
