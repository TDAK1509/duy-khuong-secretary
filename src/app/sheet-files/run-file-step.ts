import type { Clock } from '../../services/clock/clock.ts';
import type { Database } from '../db/transaction.ts';
import { enqueueFileReply, findFileRecipient } from './enqueue-file-reply.ts';
import { claimFile, completeFileStep, extendFileLease, FileClaimLostError, LEASE_MS, releaseFileForRetry, writeFenced, type FileClaim, type FileStep } from './file-claims.ts';
import type { HeldFiles } from './held-files.ts';
import { saveSheetDrafts, type SavedCounts, type SheetBatch } from './save-sheet-drafts.ts';

export type SheetSave = { batch: SheetBatch; describe(counts: SavedCounts): string };

export type FileOutcome = { finishesFile: boolean } & ({ text: string } | { sheet: SheetSave });

export type RenewLease = () => Promise<void>;

export type FileWork = {
  step: FileStep;
  run(claim: FileClaim, renewLease: RenewLease): Promise<FileOutcome>;
  describeGiveUp(claim: FileClaim): string;
};

export type FileStepDependencies = { database: Database; clock: Clock; maxTextLength: number; held: HeldFiles };

const MAX_ATTEMPTS = 5;

export async function runFileStep(dependencies: FileStepDependencies, work: FileWork): Promise<'processed' | 'idle'> {
  const claim = await claimFile(dependencies.database, work.step, dependencies.clock.now());
  if (claim === null) return 'idle';
  dependencies.held.add(claim);
  try {
    await settleClaim(dependencies, work, claim);
  } catch (error) {
    if (error instanceof FileClaimLostError) return 'processed';
    console.error(`[files] step failed file=${claim.fileId} step=${claim.step} error=${error instanceof Error ? error.name : 'unknown'}`);
    await releaseFileForRetry(dependencies.database, claim, error, dependencies.clock.now());
  } finally {
    dependencies.held.remove(claim.fileId);
  }
  return 'processed';
}

async function settleClaim(dependencies: FileStepDependencies, work: FileWork, claim: FileClaim): Promise<void> {
  if (claim.attempts > MAX_ATTEMPTS) return giveUp(dependencies, work, claim);
  const renewLease = async () => {
    if (!(await extendFileLease(dependencies.database, claim, new Date(dependencies.clock.now().getTime() + LEASE_MS)))) throw new FileClaimLostError(claim.fileId);
  };
  await commitOutcome(dependencies, claim, await work.run(claim, renewLease));
}

async function giveUp(dependencies: FileStepDependencies, work: FileWork, claim: FileClaim): Promise<void> {
  const committed = await commitOutcome(dependencies, claim, { text: work.describeGiveUp(claim), finishesFile: true });
  if (committed) console.error(`[files] gave up file=${claim.fileId} step=${claim.step} error=${(claim.lastError ?? 'unknown').split(':')[0]}`);
}

async function commitOutcome(dependencies: FileStepDependencies, claim: FileClaim, outcome: FileOutcome): Promise<boolean> {
  const now = dependencies.clock.now();
  return writeFenced(dependencies.database, claim, async (transaction) => {
    const recipient = await findFileRecipient(transaction, claim);
    if (recipient === null) {
      console.log(`[files] admin gone file=${claim.fileId}`);
      return completeFileStep(transaction, claim, { finishesFile: true }, now);
    }
    const text = 'sheet' in outcome ? outcome.sheet.describe(await saveSheetDrafts(transaction, claim, outcome.sheet.batch)) : outcome.text;
    await enqueueFileReply(transaction, { recipient, text, now, maxTextLength: dependencies.maxTextLength });
    await completeFileStep(transaction, claim, { finishesFile: outcome.finishesFile }, now);
  });
}
