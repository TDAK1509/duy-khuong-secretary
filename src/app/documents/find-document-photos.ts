import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { AttachablePhoto } from '../records/find-record-photos.ts';

type PhotoRow = { source_message_id: string; image_key: string };

export async function findDocumentPhotos(database: Database, scope: AccessScope, documentIds: string[]): Promise<AttachablePhoto[]> {
  const { rows } = await database.query<PhotoRow>(
    `SELECT message.id AS source_message_id, message.image_key
     FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
     JOIN documents document ON document.id = wanted.id
     JOIN document_sources document_source ON document_source.document_id = document.id
     JOIN messages message ON message.id = document_source.message_id
     WHERE document.workspace_id = $1 AND document_source.workspace_id = $1 AND message.workspace_id = $1
       AND message.image_key IS NOT NULL AND ($3::uuid IS NULL OR message.user_id = $3)
     ORDER BY wanted.position, message.created_at, message.id, document_source.item_index`,
    [scope.workspaceId, documentIds, scope.role === 'member' ? scope.userId : null],
  );
  return rows.map((row) => ({ sourceMessageId: row.source_message_id, imageKey: row.image_key }));
}
