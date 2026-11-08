import { z } from 'zod';
import { scopeDatabase } from '../app/db/scoped-database.ts';
import { findMessagesToReread } from '../app/document-reads/find-messages-to-reread.ts';
import { findTestPhotosToRemove } from '../app/document-reads/find-test-photos-to-remove.ts';
import { rereadDocuments, type RereadSummary } from '../app/document-reads/reread-documents.ts';
import type { RereadServices } from '../app/document-reads/reread-message.ts';
import { createPostgresPool, type PostgresPool } from '../providers/database/postgres.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import type { PhotoStorage } from '../services/storage/photo-storage.ts';
import { readRuntimeDatabaseUrl } from './config.ts';
import { buildPhotoStorage, buildReader } from './from-env.ts';
import { loadPhotoStorageConfig, type PhotoStorageConfig } from './photo-storage-config.ts';
import { loadReaderConfig, type ReaderConfig } from './reader-config.ts';

const USAGE =
  'Usage: node dist/bootstrap/reread-documents.js <workspace-uuid> [--test-photo <message-uuid>]... [--apply]';

export type RereadDocumentsOptions = {
  log?: (line: string) => void;
  buildReader?: (config: ReaderConfig) => ReaderService;
  buildPhotoStorage?: (config: PhotoStorageConfig) => PhotoStorage;
};

type RereadArguments = { workspaceId: string; testPhotoIds: string[]; apply: boolean };

type Problem = { problem: string };

type RereadSetup = Problem | { databaseUrl: string; arguments: RereadArguments; services: RereadServices | null };

export async function runRereadDocumentsCommand(
  args: string[],
  environment: NodeJS.ProcessEnv,
  options: RereadDocumentsOptions = {},
): Promise<number> {
  const log = options.log ?? console.log;
  const setup = readSetup(args, environment, options);
  if ('problem' in setup) {
    log(setup.problem);
    return 1;
  }
  const pool = createPostgresPool(setup.databaseUrl);
  try {
    return await runReread(pool, setup.arguments, setup.services, log);
  } finally {
    await pool.end();
  }
}

function readSetup(args: string[], environment: NodeJS.ProcessEnv, options: RereadDocumentsOptions): RereadSetup {
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) return { problem: 'DATABASE_URL must be set to a database URL' };
  const parsedArguments = parseArguments(args);
  if (parsedArguments === null) return { problem: USAGE };
  const services = parsedArguments.apply ? readServices(environment, options) : null;
  if (services !== null && 'problem' in services) return services;
  return { databaseUrl: databaseUrl.data, arguments: parsedArguments, services };
}

function readServices(environment: NodeJS.ProcessEnv, options: RereadDocumentsOptions): RereadServices | Problem {
  const readerConfig = loadReaderConfig(environment);
  if (!readerConfig.ok) return { problem: `Missing reader settings: ${readerConfig.missing.join(', ')}` };
  const photoStorageConfig = loadPhotoStorageConfig(environment);
  if (!photoStorageConfig.ok) return { problem: `Missing photo storage settings: ${photoStorageConfig.missing.join(', ')}` };
  return {
    reader: (options.buildReader ?? buildReader)(readerConfig.config),
    photoStorage: (options.buildPhotoStorage ?? buildPhotoStorage)(photoStorageConfig.config),
  };
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

async function runReread(
  pool: PostgresPool,
  { workspaceId, testPhotoIds }: RereadArguments,
  services: RereadServices | null,
  log: (line: string) => void,
): Promise<number> {
  if (services === null) return printDryRun(pool, workspaceId, testPhotoIds, log);
  const summary = await rereadDocuments(pool, services, workspaceId, testPhotoIds);
  printSummary(summary, log);
  return summary.failures.length === 0 ? 0 : 1;
}

async function printDryRun(pool: PostgresPool, workspaceId: string, testPhotoIds: string[], log: (line: string) => void): Promise<number> {
  const scoped = scopeDatabase(pool, { workspaceId });
  const messageIds = await findMessagesToReread(scoped, workspaceId, testPhotoIds);
  const testPhotos = await findTestPhotosToRemove(scoped, workspaceId, testPhotoIds);
  log(
    `Messages to re-read: ${messageIds.length}. Test photos: ${testPhotos.messageIds.length}, with ${testPhotos.recordCount} records to remove. Nothing changed. Run again with --apply.`,
  );
  return 0;
}

function printSummary({ stored, noDocument, testPhotos, failures }: RereadSummary, log: (line: string) => void): void {
  for (const failure of failures) log(`Failed message ${failure.messageId}: ${failure.reason}`);
  const read = stored + noDocument + failures.length;
  log(`Re-read ${read} messages. Stored ${stored} documents. No document in ${noDocument}. Test photos: ${testPhotos}. Failed ${failures.length}.`);
}

if (import.meta.main) {
  process.exitCode = await runRereadDocumentsCommand(process.argv.slice(2), process.env);
}
