import type { PhotoStorage } from '../../services/storage/photo-storage.ts';
import type { Database, DatabaseClient } from '../db/transaction.ts';
import { runWithClient } from '../db/transaction.ts';

export type CleanupDependencies = {
  database: Database;
  photoStorage: PhotoStorage;
  retentionDays: number;
  batchSize: number;
};

export type CleanupResult = { deleted: number; failed: number };

type EligibleMessage = { id: string; image_key: string };

export async function cleanupOldPhotos(deps: CleanupDependencies, now: Date): Promise<CleanupResult> {
  return runWithClient(deps.database, (client) =>
    processCleanupBatch(client, deps.photoStorage, deps.retentionDays, deps.batchSize, now),
  );
}

async function processCleanupBatch(
  client: DatabaseClient,
  photoStorage: PhotoStorage,
  retentionDays: number,
  batchSize: number,
  now: Date,
): Promise<CleanupResult> {
  const rows = await selectEligibleMessages(client, retentionDays, batchSize, now);
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    const success = await deletePhotoAndMark(client, photoStorage, row, now);
    if (success) deleted += 1;
    else failed += 1;
  }
  return { deleted, failed };
}

async function selectEligibleMessages(
  client: DatabaseClient,
  retentionDays: number,
  batchSize: number,
  now: Date,
): Promise<EligibleMessage[]> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await client.query(
    `SELECT id, image_key
       FROM messages
      WHERE image_key IS NOT NULL AND image_deleted_at IS NULL AND created_at < $1
      ORDER BY created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [cutoff, batchSize],
  );
  return result.rows as EligibleMessage[];
}

async function deletePhotoAndMark(
  client: DatabaseClient,
  photoStorage: PhotoStorage,
  row: EligibleMessage,
  now: Date,
): Promise<boolean> {
  try {
    await photoStorage.delete(row.image_key);
    await client.query(`UPDATE messages SET image_deleted_at = $1 WHERE id = $2 AND image_deleted_at IS NULL`, [
      now,
      row.id,
    ]);
    return true;
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    console.error(`[photo-cleanup] failed to delete message ${row.id}: ${name}`);
    return false;
  }
}
