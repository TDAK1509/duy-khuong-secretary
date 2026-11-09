import type { Database } from '../db/transaction.ts';

export type TestPhotosToRemove = { messageIds: string[]; recordCount: number };

export async function findTestPhotosToRemove(scoped: Database, workspaceId: string, testPhotoIds: string[]): Promise<TestPhotosToRemove> {
  const { rows } = await scoped.query<{ id: string; record_count: number }>(TEST_PHOTOS_WITHOUT_A_READ, [workspaceId, testPhotoIds]);
  return {
    messageIds: rows.map((row) => row.id),
    recordCount: rows.reduce((total, row) => total + row.record_count, 0),
  };
}

const TEST_PHOTOS_WITHOUT_A_READ = `
  SELECT message.id, (SELECT count(*)::int FROM records record WHERE record.message_id = message.id) AS record_count
  FROM messages message
  WHERE message.workspace_id = $1 AND message.id = ANY($2::uuid[])
    AND NOT EXISTS (SELECT 1 FROM document_reads read WHERE read.message_id = message.id)
  ORDER BY message.created_at, message.id`;
