import { z } from 'zod';
import { findMessagesToReread } from '../app/document-reads/find-messages-to-reread.ts';
import { findTestPhotosToRemove } from '../app/document-reads/find-test-photos-to-remove.ts';
import { scopeDatabase } from '../app/db/scoped-database.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import { readRuntimeDatabaseUrl } from './config.ts';
import type { ReaderConfig } from './reader-config.ts';

const USAGE =
  'Usage: node dist/bootstrap/reread-documents.js <workspace-uuid> [--test-photo <message-uuid>]... [--apply]';

export type RereadDocumentsOptions = {
  log?: (line: string) => void;
  buildReader?: (config: ReaderConfig) => ReaderService;
};

type RereadArguments = { workspaceId: string; testPhotoIds: string[]; apply: boolean };

export async function runRereadDocumentsCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: RereadDocumentsOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) {
    log('DATABASE_URL must be set to a database URL');
    return 1;
  }
  const parsedArguments = parseArguments(args);
  if (parsedArguments === null) {
    log(USAGE);
    return 1;
  }
  const pool = createPostgresPool(databaseUrl.data);
  try {
    return await printDryRun(pool, parsedArguments, log);
  } finally {
    await pool.end();
  }
}

async function printDryRun(pool: PostgresPool, { workspaceId, testPhotoIds }: RereadArguments, log: (line: string) => void): Promise<number> {
  const scoped = scopeDatabase(pool, { workspaceId });
  const messageIds = await findMessagesToReread(scoped, workspaceId, testPhotoIds);
  const testPhotos = await findTestPhotosToRemove(scoped, workspaceId, testPhotoIds);
  log(
    `Messages to re-read: ${messageIds.length}. Test photos: ${testPhotos.messageIds.length}, with ${testPhotos.recordCount} records to remove. Nothing changed. Run again with --apply.`,
  );
  return 0;
}

function parseArguments(args: string[]): RereadArguments | null {
  const [workspaceId, ...flags] = args;
  const parsedWorkspaceId = z.uuid().safeParse(workspaceId);
  const parsedFlags = parseFlags(flags);
  if (!parsedWorkspaceId.success || parsedFlags === null) return null;
  return { workspaceId: parsedWorkspaceId.data, ...parsedFlags };
}

function parseFlags([flag, id, ...rest]: string[]): Omit<RereadArguments, 'workspaceId'> | null {
  if (flag === undefined) return { testPhotoIds: [], apply: false };
  if (flag === '--apply') return id === undefined ? { testPhotoIds: [], apply: true } : null;
  const parsedId = z.uuid().safeParse(id);
  if (flag !== '--test-photo' || !parsedId.success) return null;
  const others = parseFlags(rest);
  return others && { ...others, testPhotoIds: [parsedId.data, ...others.testPhotoIds] };
}

if (import.meta.main) {
  process.exitCode = await runRereadDocumentsCommand(process.argv.slice(2), process.env);
}
