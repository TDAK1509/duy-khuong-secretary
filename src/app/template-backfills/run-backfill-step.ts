import type { Clock } from '../../services/clock/clock.ts';
import { hasCredits } from '../credits/has-credits.ts';
import type { Transaction } from '../db/transaction.ts';
import { BackfillClaimLostError, claimBackfill, releaseBackfillForRetry, writeFenced, type BackfillClaim } from './backfill-claims.ts';
import { OUT_OF_CREDIT_STOP_REASON } from './backfill-texts.ts';
import { enqueueBackfillResult, type BackfillEnding } from './enqueue-backfill-result.ts';
import type { HeldBackfills } from './held-backfills.ts';
import { readBackfillPaper, type PaperRead, type PaperReaderDependencies } from './read-backfill-paper.ts';
import { settlePaper, type PaperOutcome } from './settle-paper.ts';

export type BackfillStepDependencies = PaperReaderDependencies & { clock: Clock; held: HeldBackfills };

const MAX_ATTEMPTS = 5;

const COUNT_COLUMNS: Record<PaperOutcome, string> = {
  updated: 'updated_count',
  unmatched: 'unmatched_count',
  skipped: 'skipped_count',
  failed: 'failed_count',
};

export async function runBackfillStep(dependencies: BackfillStepDependencies): Promise<'processed' | 'idle'> {
  const claim = await claimBackfill(dependencies.database, dependencies.clock.now());
  if (claim === null) return 'idle';
  dependencies.held.add(claim);
  try {
    await settleClaim(dependencies, claim);
  } catch (error) {
    if (error instanceof BackfillClaimLostError) return 'processed';
    console.error(`[template-backfill] step failed backfill=${claim.backfillId} error=${error instanceof Error ? error.name : 'unknown'}`);
    await releaseBackfillForRetry(dependencies.database, claim, dependencies.clock.now());
  } finally {
    dependencies.held.remove(claim.backfillId);
  }
  return 'processed';
}

async function settleClaim(dependencies: BackfillStepDependencies, claim: BackfillClaim): Promise<void> {
  if (claim.paperId === null) return finishRun(dependencies, claim, { status: 'done' });
  if (!(await hasCredits(dependencies.database, claim.workspaceId))) return finishRun(dependencies, claim, { status: 'stopped', stopReason: OUT_OF_CREDIT_STOP_REASON });
  const target = { workspaceId: claim.workspaceId, paperId: claim.paperId };
  const read: PaperRead = claim.attempts > MAX_ATTEMPTS ? { kind: 'failed' } : await readBackfillPaper(dependencies, target);
  await recordPaper(dependencies, claim, claim.paperId, read);
}

async function recordPaper(dependencies: BackfillStepDependencies, claim: BackfillClaim, paperId: string, read: PaperRead): Promise<void> {
  await writeFenced(dependencies.database, claim, { locksRecords: true }, async (transaction, run) => {
    const outcome = await settlePaper(transaction, { workspaceId: claim.workspaceId, paperId, templateId: run.templateId }, read);
    await advanceRun(transaction, claim.backfillId, outcome);
  });
}

async function advanceRun(transaction: Transaction, backfillId: string, outcome: PaperOutcome): Promise<void> {
  const column = COUNT_COLUMNS[outcome];
  await transaction.query(
    `UPDATE template_backfills
     SET next_index = next_index + 1, ${column} = ${column} + 1, claim_token = NULL, locked_until = NULL, attempts = 0
     WHERE id = $1`,
    [backfillId],
  );
}

async function finishRun(dependencies: BackfillStepDependencies, claim: BackfillClaim, ending: BackfillEnding): Promise<void> {
  const now = dependencies.clock.now();
  await writeFenced(dependencies.database, claim, { locksRecords: false }, async (transaction, run) => {
    await transaction.query(
      `UPDATE template_backfills SET status = $2, stop_reason = $3, finished_at = $4, claim_token = NULL, locked_until = NULL WHERE id = $1`,
      [claim.backfillId, ending.status, ending.status === 'stopped' ? ending.stopReason : null, now],
    );
    await enqueueBackfillResult(transaction, { workspaceId: claim.workspaceId, requestedByUserId: claim.requestedByUserId, run, ending, now, maxTextLength: dependencies.maxTextLength });
  });
}
