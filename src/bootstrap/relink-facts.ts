import { z } from 'zod';
import { scopeDatabase } from '../app/db/scoped-database.ts';
import { relinkFacts, type RelinkedFact } from '../app/facts/relink-facts.ts';
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
    const results = await relinkFacts(scopeDatabase(pool, { workspaceId: parsed.workspaceId }), parsed.workspaceId, parsed.apply);
    for (const result of results) log(describeResult(result));
    log(parsed.apply ? `Relinked ${results.length} facts.` : `Checked ${results.length} facts. Nothing changed. Run again with --apply.`);
    return 0;
  } finally {
    await pool.end();
  }
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

function describeResult({ factId, before, after, customer, customerProblem }: RelinkedFact): string {
  const customerNote = customer === null ? '' : ` customer=${customer}`;
  const problemNote = customerProblem === null ? '' : ` (${customerProblem}, customer not filled)`;
  return `${factId} ${before} → ${after}${customerNote}${problemNote}`;
}

if (import.meta.main) {
  process.exitCode = await runRelinkFactsCommand(process.argv.slice(2), process.env);
}
