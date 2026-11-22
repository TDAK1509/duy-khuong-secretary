import { runInTransaction, type Database, type Transaction } from '../../../db/transaction.ts';
import { lockWorkspaceRecords } from '../../../records/lock-workspace-records.ts';

export type BackfillClaim = {
  backfillId: string;
  workspaceId: string;
  token: string;
  attempts: number;
  paperId: string | null;
  requestedByUserId: string | null;
};

export type HeldBackfill = Pick<BackfillClaim, 'backfillId' | 'workspaceId' | 'token'>;

export type FencedRun = {
  templateId: string;
  templateName: string;
  total: number;
  nextIndex: number;
  updatedCount: number;
  unmatchedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type FenceOptions = { locksRecords: boolean };

export const LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 30_000;
const MAX_RETRY_DOUBLINGS = 4;

type ClaimRow = { id: string; workspace_id: string; claim_token: string; attempts: number; paper_id: string | null; requested_by_user_id: string | null };

type FencedRow = {
  template_id: string;
  template_name: string;
  total: number;
  next_index: number;
  updated_count: number;
  unmatched_count: number;
  skipped_count: number;
  failed_count: number;
};

const FENCE_SQL = `
  SELECT template.id AS template_id, template.name AS template_name, cardinality(run.document_ids) AS total, run.next_index,
    run.updated_count, run.unmatched_count, run.skipped_count, run.failed_count
  FROM template_backfills run
  JOIN document_templates template
    ON template.id = run.template_id AND template.workspace_id = run.workspace_id AND template.revision = run.template_revision
  WHERE run.id = $1 AND run.claim_token = $2 AND run.status = 'pending'
  FOR UPDATE OF run`;

const TAKE_LEASE_SQL = `
  UPDATE template_backfills
  SET claim_token = gen_random_uuid(), locked_until = $2, attempts = attempts + 1
  WHERE id = $1
  RETURNING id, workspace_id, claim_token, attempts, requested_by_user_id, document_ids[next_index + 1] AS paper_id`;

export class BackfillClaimLostError extends Error {
  constructor(backfillId: string) {
    super(`the claim on template backfill ${backfillId} was lost`);
    this.name = 'BackfillClaimLostError';
  }
}

export async function claimBackfill(database: Database, now: Date): Promise<BackfillClaim | null> {
  return runInTransaction(database, async (transaction) => {
    const [candidate] = await transaction.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM template_backfills
       WHERE status = 'pending' AND (locked_until IS NULL OR locked_until <= $1)
       ORDER BY locked_until NULLS FIRST, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [now],
    );
    if (candidate === undefined) return null;
    return transaction.withScope({ workspaceId: candidate.workspace_id }, () => takeLease(transaction, candidate.id, new Date(now.getTime() + LEASE_MS)));
  });
}

async function takeLease(transaction: Transaction, backfillId: string, lockedUntil: Date): Promise<BackfillClaim> {
  const [row] = await transaction.query<ClaimRow>(TAKE_LEASE_SQL, [backfillId, lockedUntil]);
  if (row === undefined) throw new Error(`claiming template backfill ${backfillId} updated no row`);
  return { backfillId: row.id, workspaceId: row.workspace_id, token: row.claim_token, attempts: row.attempts, paperId: row.paper_id, requestedByUserId: row.requested_by_user_id };
}

export async function releaseBackfillForRetry(database: Database, claim: BackfillClaim, now: Date): Promise<void> {
  const retryAt = new Date(now.getTime() + RETRY_BASE_MS * 2 ** Math.min(MAX_RETRY_DOUBLINGS, Math.max(0, claim.attempts - 1)));
  await changeHeldBackfill(database, claim, async (transaction) => {
    await transaction.query('UPDATE template_backfills SET claim_token = NULL, locked_until = $2 WHERE id = $1', [claim.backfillId, retryAt]);
  });
}

export async function extendBackfillLease(database: Database, held: HeldBackfill, lockedUntil: Date): Promise<boolean> {
  return changeHeldBackfill(database, held, async (transaction) => {
    await transaction.query('UPDATE template_backfills SET locked_until = $2 WHERE id = $1', [held.backfillId, lockedUntil]);
  });
}

export async function handBackBackfill(database: Database, held: HeldBackfill): Promise<boolean> {
  return changeHeldBackfill(database, held, async (transaction) => {
    await transaction.query('UPDATE template_backfills SET claim_token = NULL, locked_until = NULL, attempts = greatest(attempts - 1, 0) WHERE id = $1', [held.backfillId]);
  });
}

async function changeHeldBackfill(database: Database, held: HeldBackfill, change: (transaction: Transaction) => Promise<void>): Promise<boolean> {
  try {
    await writeFenced(database, held, { locksRecords: false }, change);
    return true;
  } catch (error) {
    if (error instanceof BackfillClaimLostError) return false;
    throw error;
  }
}

export async function writeFenced<Result>(
  database: Database,
  held: HeldBackfill,
  options: FenceOptions,
  write: (transaction: Transaction, run: FencedRun) => Promise<Result>,
): Promise<Result> {
  return runInTransaction(database, (transaction) =>
    transaction.withScope({ workspaceId: held.workspaceId }, async () => {
      if (options.locksRecords) await lockWorkspaceRecords(transaction, held.workspaceId);
      const [row] = await transaction.query<FencedRow>(FENCE_SQL, [held.backfillId, held.token]);
      if (row === undefined) throw new BackfillClaimLostError(held.backfillId);
      return write(transaction, toFencedRun(row));
    }),
  );
}

function toFencedRun(row: FencedRow): FencedRun {
  return {
    templateId: row.template_id,
    templateName: row.template_name,
    total: row.total,
    nextIndex: row.next_index,
    updatedCount: row.updated_count,
    unmatchedCount: row.unmatched_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
  };
}
