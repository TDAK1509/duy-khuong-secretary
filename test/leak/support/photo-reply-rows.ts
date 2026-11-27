import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './seed-ids.ts';

const CHANNEL = 'zalo-oa';
const ACCOUNT_ID = 'seed-oa';
const ADMIN_EXTERNAL_USER_ID = 'seed-zalo-admin-a';
const DRIVER_USER_ID = 'aaaaaaaa-0001-4000-8000-000000000002';
const DRIVER_EXTERNAL_USER_ID = 'seed-zalo-driver';
const REPLY_TIME = '2026-03-02 12:00:00+00';

export type PhotoPaperSpec = {
  key: string;
  plate: string;
  date: string;
  number?: string;
  stage?: 'dispatch' | 'receipt';
  sentBy?: 'driver' | 'admin';
  at?: string;
  status?: 'accepted' | 'needs_review';
  photoMessageId?: string;
  itemIndex?: number;
};

export type PhotoPaper = { paperId: string; photoMessageId: string };

export async function insertPhotoPaper(owner: PostgresPool, spec: PhotoPaperSpec): Promise<PhotoPaper> {
  const sender = spec.sentBy === 'admin' ? { userId: A_ADMIN_USER_ID, externalUserId: ADMIN_EXTERNAL_USER_ID } : { userId: DRIVER_USER_ID, externalUserId: DRIVER_EXTERNAL_USER_ID };
  const photoMessageId = spec.photoMessageId ?? (await insertPhotoMessage(owner, spec, sender));
  const paperId = await insertPaper(owner, spec);
  await owner.query('INSERT INTO document_sources (workspace_id, document_id, message_id, item_index) VALUES ($1, $2, $3, $4)', [WORKSPACE_A_ID, paperId, photoMessageId, spec.itemIndex ?? 0]);
  return { paperId, photoMessageId };
}

export function buildImageKey(key: string): string {
  return `photo-reply-test/${key}.jpg`;
}

async function insertPhotoMessage(owner: PostgresPool, spec: PhotoPaperSpec, sender: { userId: string; externalUserId: string }): Promise<string> {
  const eventId = await insertInboundEvent(owner, { externalEventId: spec.key, externalUserId: sender.externalUserId, kind: 'images', payload: {} });
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, image_key, inbound_event_id, event_part, submission_status, created_at)
     VALUES ($1, $2, 'user', $3, $4, $5, 0, 'accepted', $6) RETURNING id`,
    [WORKSPACE_A_ID, sender.userId, `photo ${spec.key}`, buildImageKey(spec.key), eventId, spec.at ?? '2026-03-02 08:00:00+00'],
  );
  return rows[0]!.id;
}

async function insertPaper(owner: PostgresPool, spec: PhotoPaperSpec): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO documents (workspace_id, kind, stage, document_number, document_date, vehicle_plate, summary, status)
     VALUES ($1, 'weigh-ticket', $2, $3, $4, $5, $6, $7) RETURNING id`,
    [WORKSPACE_A_ID, spec.stage ?? 'receipt', spec.number ?? null, spec.date, spec.plate, `paper ${spec.key}`, spec.status ?? 'accepted'],
  );
  return rows[0]!.id;
}

type InboundEventSpec = { externalEventId: string; externalUserId: string; kind: 'text' | 'images'; payload: object };

async function insertInboundEvent(owner: PostgresPool, spec: InboundEventSpec): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO inbound_events (channel, account_id, external_event_id, external_user_id, kind, payload, status, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'done', now()) RETURNING id`,
    [CHANNEL, ACCOUNT_ID, spec.externalEventId, spec.externalUserId, spec.kind, JSON.stringify(spec.payload)],
  );
  return rows[0]!.id;
}

export async function insertSentPhoto(owner: PostgresPool, sent: { imageKey: string; zaloMessageId: string; externalUserId?: string }): Promise<void> {
  await owner.query(
    `INSERT INTO outbound_messages (channel, account_id, external_user_id, kind, photo_key, status, sent_at, external_message_id)
     VALUES ($1, $2, $3, 'image', $4, 'sent', now(), $5)`,
    [CHANNEL, ACCOUNT_ID, sent.externalUserId ?? ADMIN_EXTERNAL_USER_ID, sent.imageKey, sent.zaloMessageId],
  );
}

export type ReplyMessage = { id: string; text: string };

export async function insertReplyMessage(owner: PostgresPool, reply: { text: string; quotedId: string }): Promise<ReplyMessage> {
  const eventId = await insertInboundEvent(owner, {
    externalEventId: `reply-to-${reply.quotedId}`,
    externalUserId: ADMIN_EXTERNAL_USER_ID,
    kind: 'text',
    payload: { text: reply.text, quote_msg_id: reply.quotedId },
  });
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, inbound_event_id, event_part, submission_status, created_at)
     VALUES ($1, $2, 'user', $3, $4, 0, 'accepted', $5) RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, reply.text, eventId, REPLY_TIME],
  );
  return { id: rows[0]!.id, text: reply.text };
}

export async function listPapersWithDropOff(owner: PostgresPool, companyName: string): Promise<string[]> {
  const { rows } = await owner.query<{ document_id: string }>('SELECT document_id FROM document_parties WHERE printed_name = $1', [companyName]);
  return rows.map((row) => row.document_id);
}

export async function readPaperPlate(owner: PostgresPool, paperId: string): Promise<string | null> {
  const { rows } = await owner.query<{ vehicle_plate: string | null }>('SELECT vehicle_plate FROM documents WHERE id = $1', [paperId]);
  return rows[0]!.vehicle_plate;
}
