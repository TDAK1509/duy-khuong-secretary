import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { RecordSource } from '../records/record-source.ts';
import { buildSourceParameters, groupByMessage, SOURCE_MESSAGE_COLUMNS, type SourceMessageRow } from '../records/source-message-rows.ts';

export type DocumentSources = { foundDocumentIds: string[]; sources: RecordSource[] };

export async function findDocumentSources(database: Database, scope: AccessScope, documentIds: string[]): Promise<DocumentSources> {
  const { rows } = await database.query<SourceMessageRow>(
    `SELECT document.id AS target_id, ${SOURCE_MESSAGE_COLUMNS}, to_char(document.document_date, 'YYYY-MM-DD') AS paper_date
     FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
     JOIN documents document ON document.id = wanted.id
     JOIN document_sources document_source ON document_source.document_id = document.id
     JOIN messages message ON message.id = document_source.message_id
     LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE document.workspace_id = $1 AND document_source.workspace_id = $1 AND message.workspace_id = $1
       AND ($3::uuid IS NULL OR message.user_id = $3)
     ORDER BY wanted.position, message.created_at, message.id, document_source.item_index`,
    buildSourceParameters(scope, documentIds),
  );
  const grouped = groupByMessage(rows);
  return { foundDocumentIds: [...new Set(grouped.flatMap(({ targetIds }) => targetIds))], sources: grouped.map(({ source, targetIds }) => ({ ...source, documentIds: targetIds })) };
}
