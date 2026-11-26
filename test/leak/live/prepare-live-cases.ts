import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_SENDER } from '../support/seed-chat-ids.ts';
import { A_ADMIN_USER_ID, SHARED_PLATE, WORKSPACE_A_ID } from '../support/seed-ids.ts';

export const INJECTED_PHOTO_KEY = 'seed/safea-live-photo.jpg';

const INJECTED_FACT_ID = 'aaaaaaaa-0014-4000-8000-0000000000e5';
const INJECTED_DOCUMENT_ID = 'aaaaaaaa-0011-4000-8000-0000000000e6';
const INJECTED_PHOTO_EVENT_ID = 'aaaaaaaa-0019-4000-8000-0000000000e7';
const INJECTED_PHOTO_MESSAGE_ID = 'aaaaaaaa-0020-4000-8000-0000000000e7';
const INJECTED_PHOTO_RECORD_ID = 'aaaaaaaa-0021-4000-8000-0000000000e7';
const SENT_BEFORE_THE_CHAT = '2026-03-09 08:00:00+00';

export async function addInjectedFact(owner: PostgresPool, statement: string): Promise<void> {
  await owner.query(
    'INSERT INTO facts (id, workspace_id, author_user_id, statement, vehicle_plate) VALUES ($1, $2, $3, $4, $5)',
    [INJECTED_FACT_ID, WORKSPACE_A_ID, A_ADMIN_USER_ID, statement, SHARED_PLATE],
  );
}

export async function addInjectedDocument(owner: PostgresPool, title: string): Promise<void> {
  await owner.query(
    `INSERT INTO documents (id, workspace_id, kind, stage, document_date, title, vehicle_plate, summary)
     VALUES ($1, $2, 'weigh-ticket', 'dispatch', '2026-03-05', $3, $4, 'SAFE-A-DOC phiếu cân xe ' || $4)`,
    [INJECTED_DOCUMENT_ID, WORKSPACE_A_ID, title, SHARED_PLATE],
  );
}

export async function addInjectedPhotoMessage(owner: PostgresPool, caption: string): Promise<void> {
  await owner.query(
    `INSERT INTO inbound_events (id, channel, account_id, external_event_id, external_user_id, kind, payload, status, processed_at)
     VALUES ($1, $2, $3, 'SAFE-A-LIVE-PHOTO-EVENT', $4, 'images', '{}', 'done', $5)`,
    [INJECTED_PHOTO_EVENT_ID, A_ADMIN_SENDER.channel, A_ADMIN_SENDER.accountId, A_ADMIN_SENDER.externalUserId, SENT_BEFORE_THE_CHAT],
  );
  await owner.query(
    `INSERT INTO messages (id, workspace_id, user_id, author, text, image_key, inbound_event_id, event_part, submission_status, created_at)
     VALUES ($1, $2, $3, 'user', $4, $5, $6, 0, 'accepted', $7)`,
    [INJECTED_PHOTO_MESSAGE_ID, WORKSPACE_A_ID, A_ADMIN_USER_ID, caption, INJECTED_PHOTO_KEY, INJECTED_PHOTO_EVENT_ID, SENT_BEFORE_THE_CHAT],
  );
  await owner.query(
    `INSERT INTO records (id, workspace_id, user_id, message_id, item_index, sender_name, category, vehicle_plate, occurred_on, summary, details, created_at)
     VALUES ($1, $2, $3, $4, 0, 'SAFE-A-ADMIN', 'phiếu cân', $5, '2026-03-05', 'SAFE-A-RECORD ảnh phiếu cân xe ' || $5, '[]', $6)`,
    [INJECTED_PHOTO_RECORD_ID, WORKSPACE_A_ID, A_ADMIN_USER_ID, INJECTED_PHOTO_MESSAGE_ID, SHARED_PLATE, SENT_BEFORE_THE_CHAT],
  );
}
