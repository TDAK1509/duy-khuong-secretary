import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';

export type AttachablePhoto = { sourceMessageId: string; imageKey: string };

type PhotoRow = { source_message_id: string; image_key: string };

export async function findRecordPhotos(database: Database, scope: AccessScope, recordIds: string[]): Promise<AttachablePhoto[]> {
  const { rows } = await database.query<PhotoRow>(
    `SELECT message.id AS source_message_id, message.image_key
     FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
     JOIN records record ON record.id = wanted.id
     JOIN messages message ON message.id = record.message_id
     WHERE record.workspace_id = $1 AND message.image_key IS NOT NULL
     ORDER BY wanted.position`,
    [scope.workspaceId, recordIds],
  );
  return rows.map((row) => ({ sourceMessageId: row.source_message_id, imageKey: row.image_key }));
}
