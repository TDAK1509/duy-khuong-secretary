import type { SheetExtension } from '../../services/storage/file-storage.ts';
import { runInTransaction, type Database, type Transaction } from '../db/transaction.ts';

export type FileStep = 'parse' | 'process';

export type FileClaim = {
  fileId: string;
  workspaceId: string;
  step: FileStep;
  token: string;
  attempts: number;
  lastError: string | null;
  fileKey: string;
  fileName: string;
  extension: SheetExtension;
  messageId: string;
  caption: string | null;
};

export type HeldFile = Pick<FileClaim, 'fileId' | 'workspaceId' | 'step' | 'token'>;

export const LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 30_000;
const MAX_RETRY_DOUBLINGS = 4;
const MAX_ERROR_LENGTH = 200;

const STEP_STATE: Record<FileStep, string> = {
  parse: 'parsed_at IS NULL',
  process: 'parsed_at IS NOT NULL AND processed_at IS NULL',
};

type ClaimRow = { id: string; workspace_id: string; claim_token: string; attempts: number; last_error: string | null; file_key: string; file_name: string; extension: SheetExtension; message_id: string; caption: string | null };

export async function claimFile(database: Database, step: FileStep, now: Date): Promise<FileClaim | null> {
  return runInTransaction(database, async (transaction) => {
    const [candidate] = await transaction.query<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM message_files
       WHERE ${STEP_STATE[step]} AND (locked_until IS NULL OR locked_until < $1)
       ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [now],
    );
    if (candidate === undefined) return null;
    return transaction.withScope({ workspaceId: candidate.workspace_id }, () => takeLease(transaction, candidate.id, new Date(now.getTime() + LEASE_MS), step));
  });
}

async function takeLease(transaction: Transaction, fileId: string, lockedUntil: Date, step: FileStep): Promise<FileClaim> {
  const [row] = await transaction.query<ClaimRow>(
    `UPDATE message_files SET claim_token = gen_random_uuid(), locked_until = $2, attempts = attempts + 1
     WHERE id = $1
     RETURNING id, workspace_id, claim_token, attempts, last_error, file_key, file_name, extension, message_id, caption`,
    [fileId, lockedUntil],
  );
  if (row === undefined) throw new Error(`claiming file ${fileId} updated no row`);
  return {
    fileId: row.id,
    workspaceId: row.workspace_id,
    step,
    token: row.claim_token,
    attempts: row.attempts,
    lastError: row.last_error,
    fileKey: row.file_key,
    fileName: row.file_name,
    extension: row.extension,
    messageId: row.message_id,
    caption: row.caption,
  };
}

export async function writeFenced(database: Database, held: HeldFile, write: (transaction: Transaction) => Promise<void>): Promise<boolean> {
  return runInTransaction(database, (transaction) =>
    transaction.withScope({ workspaceId: held.workspaceId }, async () => {
      const locked = await transaction.query(`SELECT 1 FROM message_files WHERE id = $1 AND claim_token = $2 AND ${STEP_STATE[held.step]} FOR UPDATE`, [held.fileId, held.token]);
      if (locked.length === 0) {
        console.error(`[files] claim lost file=${held.fileId} step=${held.step}`);
        return false;
      }
      await write(transaction);
      return true;
    }),
  );
}

export async function completeFileStep(transaction: Transaction, held: HeldFile, { finishesFile }: { finishesFile: boolean }, now: Date): Promise<void> {
  await transaction.query(
    `UPDATE message_files
     SET parsed_at = coalesce(parsed_at, $2), processed_at = CASE WHEN $3 THEN $2 ELSE processed_at END,
         claim_token = NULL, locked_until = NULL, attempts = 0, last_error = NULL
     WHERE id = $1`,
    [held.fileId, now, finishesFile],
  );
}

export async function releaseFileForRetry(database: Database, claim: FileClaim, error: unknown, now: Date): Promise<void> {
  const retryAt = new Date(now.getTime() + RETRY_BASE_MS * 2 ** Math.min(MAX_RETRY_DOUBLINGS, Math.max(0, claim.attempts - 1)));
  await writeFenced(database, claim, async (transaction) => {
    await transaction.query('UPDATE message_files SET claim_token = NULL, locked_until = $2, last_error = $3 WHERE id = $1', [claim.fileId, retryAt, describeError(error)]);
  });
}

function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  return text.slice(0, MAX_ERROR_LENGTH);
}

export class FileClaimLostError extends Error {
  constructor(fileId: string) {
    super(`the claim on file ${fileId} was lost`);
    this.name = 'FileClaimLostError';
  }
}

export async function extendFileLease(database: Database, held: HeldFile, lockedUntil: Date): Promise<boolean> {
  return writeFenced(database, held, async (transaction) => {
    await transaction.query('UPDATE message_files SET locked_until = $2 WHERE id = $1', [held.fileId, lockedUntil]);
  });
}

export async function handBackFile(database: Database, held: HeldFile): Promise<boolean> {
  return writeFenced(database, held, async (transaction) => {
    await transaction.query("UPDATE message_files SET claim_token = NULL, locked_until = NULL, attempts = greatest(attempts - 1, 0) WHERE id = $1", [held.fileId]);
  });
}
