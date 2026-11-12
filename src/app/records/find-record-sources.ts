import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { RecordSource } from './record-source.ts';
import { buildSourceParameters, groupByMessage, SOURCE_MESSAGE_COLUMNS, type SourceMessageRow } from './source-message-rows.ts';

export async function findRecordSources(database: Database, scope: AccessScope, recordIds: string[]): Promise<RecordSource[]> {
  const { rows } = await database.query<SourceMessageRow>(
    `SELECT record.id AS target_id, ${SOURCE_MESSAGE_COLUMNS}, to_char(record.occurred_on, 'YYYY-MM-DD') AS paper_date
     FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
     JOIN records record ON record.id = wanted.id
     JOIN messages message ON message.id = record.message_id
     LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE record.workspace_id = $1
       AND ($3::uuid IS NULL OR (record.user_id = $3 AND message.user_id = $3))
     ORDER BY wanted.position`,
    buildSourceParameters(scope, recordIds),
  );
  return groupByMessage(rows).map(({ source, targetIds }) => ({ ...source, recordIds: targetIds }));
}
