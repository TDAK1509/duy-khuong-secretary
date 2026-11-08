import type { Database } from '../db/transaction.ts';

export async function findNonPhotoMessage(scoped: Database, workspaceId: string, messageIds: string[]): Promise<string | null> {
  const { rows } = await scoped.query<{ id: string }>(PHOTO_MESSAGES_OF_THE_WORKSPACE, [workspaceId, messageIds]);
  const photoIds = new Set(rows.map((row) => row.id));
  return messageIds.find((id) => !photoIds.has(id)) ?? null;
}

const PHOTO_MESSAGES_OF_THE_WORKSPACE = `
  SELECT id FROM messages
  WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND author = 'user' AND image_key IS NOT NULL`;
