import { z } from 'zod';
import { scopeDatabase } from '../app/db/scoped-database.ts';
import { meterReader } from '../app/credits/meter-reader.ts';
import type { Database } from '../app/db/transaction.ts';
import { relinkEntries, type RelinkedEntry, type SlotOutcome } from '../app/facts/relink-facts.ts';
import type { ReaderService } from '../services/reading/reader-service.ts';
import { buildReader } from './from-env.ts';
import { loadReaderConfig } from './reader-config.ts';
import { createPostgresPool } from '../providers/database/postgres.ts';
import { readRuntimeDatabaseUrl } from './config.ts';

const USAGE = 'Usage: node dist/bootstrap/relink-facts.js <workspace-uuid> [--apply]';

type RelinkArguments = { workspaceId: string; apply: boolean };

export async function runRelinkFactsCommand(args: string[], environment: NodeJS.ProcessEnv, log: (line: string) => void = console.log): Promise<number> {
  const databaseUrl = z.url().safeParse(readRuntimeDatabaseUrl(environment));
  if (!databaseUrl.success) return refuse('DATABASE_URL must be set to a database URL', log);
  const parsed = parseArguments(args);
  if (parsed === null) return refuse(USAGE, log);
  const pool = createPostgresPool(databaseUrl.data);
  try {
    const database = scopeDatabase(pool, { workspaceId: parsed.workspaceId });
    const reader = parsed.apply ? buildOperatorReader(environment, database, parsed.workspaceId) : null;
    const results = await relinkEntries(database, parsed.workspaceId, { apply: parsed.apply, reader });
    for (const result of results) log(describeResult(result));
    log(parsed.apply ? `Relinked ${results.length} entries.` : `Checked ${results.length} entries. Nothing changed. Run again with --apply.`);
    return 0;
  } finally {
    await pool.end();
  }
}

function buildOperatorReader(environment: NodeJS.ProcessEnv, database: Database, workspaceId: string): ReaderService | null {
  const config = loadReaderConfig(environment);
  if (!config.ok) return null;
  return meterReader(buildReader(config.config), { database, workspaceId, charged: null }, () => 'operator_backfill');
}

function refuse(problem: string, log: (line: string) => void): number {
  log(problem);
  return 1;
}

function parseArguments([workspaceId, flag, ...rest]: string[]): RelinkArguments | null {
  const parsedWorkspaceId = z.uuid().safeParse(workspaceId);
  if (!parsedWorkspaceId.success || rest.length > 0) return null;
  if (flag !== undefined && flag !== '--apply') return null;
  return { workspaceId: parsedWorkspaceId.data, apply: flag === '--apply' };
}

function describeResult({ entryId, before, after, slots }: RelinkedEntry): string {
  return `${entryId} ${before} → ${after}${slots.map(describeSlot).join('')}`;
}

function describeSlot({ slot, name, picked }: SlotOutcome): string {
  if (picked === 'pending') return ` ${slot}=${JSON.stringify(name)}: to resolve with --apply`;
  if (picked === null) return ` ${slot}=${JSON.stringify(name)}: failed, name matching`;
  return ` ${slot}=${JSON.stringify(name)}: ${picked === 0 ? 'none' : `resolved ${picked}`}`;
}

if (import.meta.main) {
  process.exitCode = await runRelinkFactsCommand(process.argv.slice(2), process.env);
}
