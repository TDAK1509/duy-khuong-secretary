import type { AccessScope } from '../access/access-scope.ts';
import type { RecordSource, SourceEvent } from './record-source.ts';

const LEFT_GROUP_SENDER = 'Người đã rời nhóm';

export const SOURCE_MESSAGE_COLUMNS = `message.id AS message_id, message.user_id = $4 AS is_own,
       COALESCE(
         (SELECT first_record.sender_name FROM records first_record WHERE first_record.message_id = message.id ORDER BY first_record.item_index LIMIT 1),
         (SELECT membership.display_name FROM memberships membership WHERE membership.workspace_id = message.workspace_id AND membership.user_id = message.user_id),
         $5) AS sender,
       COALESCE((event.payload ->> 'sent_at')::timestamptz, message.created_at) AS sent_at,
       message.image_key, message.text, event.channel AS event_channel, event.account_id AS event_account_id,
       event.external_user_id AS event_external_user_id, event.external_event_id,
       jsonb_array_length(event.payload -> 'image_urls') AS photo_count`;

export type SourceMessageRow = {
  target_id: string;
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

export type SourceOfTargets = { source: RecordSource; targetIds: string[] };

export function buildSourceParameters(scope: AccessScope, targetIds: string[]): unknown[] {
  return [scope.workspaceId, targetIds, scope.role === 'member' ? scope.userId : null, scope.userId, LEFT_GROUP_SENDER];
}

export function groupByMessage(rows: SourceMessageRow[]): SourceOfTargets[] {
  const sources = new Map<string, SourceOfTargets>();
  for (const row of rows) {
    const known = sources.get(row.message_id) ?? { source: startSource(row), targetIds: [] };
    sources.set(row.message_id, addTarget(known, row));
  }
  return [...sources.values()].map(({ source, targetIds }) => ({ source: formatPaperDates(source), targetIds }));
}

function startSource(row: SourceMessageRow): RecordSource {
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

function readEvent(row: SourceMessageRow): SourceEvent | null {
  if (row.external_event_id === null || row.event_channel === null || row.event_account_id === null || row.event_external_user_id === null) return null;
  return {
    channel: row.event_channel,
    accountId: row.event_account_id,
    externalUserId: row.event_external_user_id,
    externalEventId: row.external_event_id,
    photoCount: row.photo_count,
  };
}

function addTarget({ source, targetIds }: SourceOfTargets, row: SourceMessageRow): SourceOfTargets {
  return {
    source: { ...source, paperDates: addPaperDate(source.paperDates, row.paper_date) },
    targetIds: targetIds.includes(row.target_id) ? targetIds : [...targetIds, row.target_id],
  };
}

function addPaperDate(paperDates: string[], paperDate: string | null): string[] {
  if (paperDate === null || paperDates.includes(paperDate)) return paperDates;
  return [...paperDates, paperDate].sort();
}

function formatPaperDates(source: RecordSource): RecordSource {
  return { ...source, paperDates: source.paperDates.map((isoDate) => isoDate.split('-').reverse().join('/')) };
}
