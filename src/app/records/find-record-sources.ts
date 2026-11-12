import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import type { RecordSource, SourceEvent } from './record-source.ts';

export const MAX_SOURCE_MESSAGES = 5;

const LEFT_GROUP_SENDER = 'Người đã rời nhóm';

type SourceRow = {
  record_id: string;
  message_id: string;
  is_own: boolean;
  sender: string;
  sent_at: Date;
  image_key: string | null;
  text: string | null;
  event_channel: string | null;
  event_account_id: string | null;
  event_external_user_id: string | null;
  external_event_id: string | null;
  photo_count: number | null;
  paper_date: string | null;
};

export async function findRecordSources(database: Database, scope: AccessScope, recordIds: string[]): Promise<RecordSource[]> {
  const { rows } = await database.query<SourceRow>(
    `SELECT record.id AS record_id, message.id AS message_id, message.user_id = $4 AS is_own,
       COALESCE(
         (SELECT first_record.sender_name FROM records first_record WHERE first_record.message_id = message.id ORDER BY first_record.item_index LIMIT 1),
         (SELECT membership.display_name FROM memberships membership WHERE membership.workspace_id = message.workspace_id AND membership.user_id = message.user_id),
         $5) AS sender,
       COALESCE((event.payload ->> 'sent_at')::timestamptz, message.created_at) AS sent_at,
       message.image_key, message.text, event.channel AS event_channel, event.account_id AS event_account_id,
       event.external_user_id AS event_external_user_id, event.external_event_id,
       jsonb_array_length(event.payload -> 'image_urls') AS photo_count,
       to_char(record.occurred_on, 'YYYY-MM-DD') AS paper_date
     FROM unnest($2::uuid[]) WITH ORDINALITY AS wanted (id, position)
     JOIN records record ON record.id = wanted.id
     JOIN messages message ON message.id = record.message_id
     LEFT JOIN inbound_events event ON event.id = message.inbound_event_id
     WHERE record.workspace_id = $1
       AND ($3::uuid IS NULL OR (record.user_id = $3 AND message.user_id = $3))
     ORDER BY wanted.position`,
    [scope.workspaceId, recordIds, scope.role === 'member' ? scope.userId : null, scope.userId, LEFT_GROUP_SENDER],
  );
  return groupByMessage(rows).slice(0, MAX_SOURCE_MESSAGES);
}

function groupByMessage(rows: SourceRow[]): RecordSource[] {
  const sources = new Map<string, RecordSource>();
  for (const row of rows) {
    const source = sources.get(row.message_id) ?? startSource(row);
    sources.set(row.message_id, addRecord(source, row));
  }
  return [...sources.values()].map(formatPaperDates);
}

function startSource(row: SourceRow): RecordSource {
  return {
    messageId: row.message_id,
    recordIds: [],
    sender: row.sender,
    isOwn: row.is_own,
    sentAt: row.sent_at,
    kind: row.image_key === null ? 'text' : 'photo',
    imageKey: row.image_key,
    event: readEvent(row),
    paperDates: [],
    text: row.text,
  };
}

function readEvent(row: SourceRow): SourceEvent | null {
  if (row.external_event_id === null || row.event_channel === null || row.event_account_id === null || row.event_external_user_id === null) return null;
  return {
    channel: row.event_channel,
    accountId: row.event_account_id,
    externalUserId: row.event_external_user_id,
    externalEventId: row.external_event_id,
    photoCount: row.photo_count,
  };
}

function addRecord(source: RecordSource, row: SourceRow): RecordSource {
  const recordIds = source.recordIds.includes(row.record_id) ? source.recordIds : [...source.recordIds, row.record_id];
  return { ...source, recordIds, paperDates: addPaperDate(source.paperDates, row.paper_date) };
}

function addPaperDate(paperDates: string[], paperDate: string | null): string[] {
  if (paperDate === null || paperDates.includes(paperDate)) return paperDates;
  return [...paperDates, paperDate].sort();
}

function formatPaperDates(source: RecordSource): RecordSource {
  return { ...source, paperDates: source.paperDates.map((isoDate) => isoDate.split('-').reverse().join('/')) };
}
