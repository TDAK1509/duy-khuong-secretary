import { randomUUID } from 'node:crypto';
import { toDatabaseScope } from '../access/to-database-scope.ts';
import type { Database, Transaction } from '../db/transaction.ts';
import { readSentAt, type ClaimedEvent } from '../processing/claimed-event.ts';
import { recordSenderIdentity } from '../processing/record-sender-identity.ts';
import type { Finished, Postponed, Stages } from '../processing/stages.ts';
import type { IntakeSender } from './find-intake-sender.ts';
import { storeUserMessage } from './store-user-message.ts';

export const CAPTION_WINDOW_MS = 5000;

export type CaptionDependencies = { database: Database; clock: { now(): Date } };

const FIND_LINKED_FILE_SQL = 'SELECT caption_for_event_id AS id FROM inbound_events WHERE id = $1 AND caption_for_event_id IS NOT NULL';

const FIND_CAPTIONED_FILE_SQL = `
  SELECT file.id FROM inbound_events file
  WHERE file.channel = $1 AND file.account_id = $2 AND file.external_user_id = $3 AND file.kind = 'file'
    AND (file.payload ->> 'sent_at')::timestamptz >= $4
    AND (file.payload ->> 'sent_at')::timestamptz <= $5
    AND NOT EXISTS (SELECT 1 FROM inbound_events caption WHERE caption.caption_for_event_id = file.id)
  ORDER BY (file.payload ->> 'sent_at')::timestamptz, file.received_at, file.id
  LIMIT 1`;

export async function holdOrLinkCaption(dependencies: CaptionDependencies, stages: Stages, event: ClaimedEvent, sender: IntakeSender): Promise<Finished | Postponed | null> {
  const sentAt = readSentAt(event);
  const windowEnd = new Date(sentAt.getTime() + CAPTION_WINDOW_MS);
  if (dependencies.clock.now() < windowEnd) return { kind: 'postponed', until: windowEnd };
  const fileEventId = await findCaptionedFile(dependencies.database, event, { sentAt, windowEnd });
  if (fileEventId === null) return null;
  return stages.forScope(toDatabaseScope(sender)).finishEvent((transaction) => storeAsCaption(transaction, event, sender, fileEventId));
}

type CaptionWindow = { sentAt: Date; windowEnd: Date };

async function findCaptionedFile(database: Database, event: ClaimedEvent, { sentAt, windowEnd }: CaptionWindow): Promise<string | null> {
  const linked = await database.query<{ id: string }>(FIND_LINKED_FILE_SQL, [event.id]);
  if (linked.rows[0] !== undefined) return linked.rows[0].id;
  const { rows } = await database.query<{ id: string }>(FIND_CAPTIONED_FILE_SQL, [event.channel, event.accountId, event.externalUserId, sentAt, windowEnd]);
  return rows[0]?.id ?? null;
}

async function storeAsCaption(transaction: Transaction, event: ClaimedEvent, sender: IntakeSender, fileEventId: string): Promise<void> {
  await recordSenderIdentity(transaction, event);
  await storeUserMessage(transaction, event, sender, { id: randomUUID(), text: readCaptionText(event), imageKey: null, partIndex: 0 });
  await transaction.query('UPDATE inbound_events SET caption_for_event_id = $2 WHERE id = $1', [event.id, fileEventId]);
  console.log(`[intake] text ${event.id} used as caption of file ${fileEventId}`);
}

function readCaptionText(event: ClaimedEvent): string | null {
  const text = event.payload['text'];
  return typeof text === 'string' ? text : null;
}

export async function findFileCaption(transaction: Transaction, fileEventId: string, maxLength: number): Promise<string | null> {
  const [row] = await transaction.query<{ text: string | null }>("SELECT payload ->> 'text' AS text FROM inbound_events WHERE caption_for_event_id = $1", [fileEventId]);
  const caption = row?.text?.trim() ?? '';
  return caption === '' ? null : caption.slice(0, maxLength);
}
