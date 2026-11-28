import { buildMatchKey } from '../../../src/app/documents/build-match-key.ts';
import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from './seed-ids.ts';

export type PaperLine = { label: string; value: string; meaning: string | null; number: number | null; unit: string | null; at: string | null };

export type ExamplePaperOptions = { imageKey: string | null; isPhotoDeleted?: boolean; status?: 'accepted' | 'needs_review'; title?: string | null; createdAt?: string | null; amountVnd?: number | null; issuerName?: string | null; lines?: PaperLine[] };

export async function insertExamplePaper(owner: PostgresPool, options: ExamplePaperOptions): Promise<string> {
  const messageId = await insertPhotoMessage(owner, options);
  const documentId = await insertDocument(owner, options);
  await owner.query('INSERT INTO document_sources (workspace_id, document_id, message_id, item_index) VALUES ($1, $2, $3, 0)', [WORKSPACE_A_ID, documentId, messageId]);
  await owner.query(
    `INSERT INTO records (workspace_id, user_id, message_id, item_index, sender_name, category, vehicle_plate, document_number, occurred_on, amount_vnd, summary, details)
     VALUES ($1, $2, $3, 0, 'EXAMPLE-DRIVER', 'phiếu cân', '99Z12345', 'EX0001', '2026-03-01', $4, 'EXAMPLE-RECORD', '[]')`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, messageId, options.amountVnd ?? null],
  );
  if (options.issuerName) await insertIssuer(owner, documentId, options.issuerName);
  for (const [lineNo, line] of (options.lines ?? []).entries()) await insertLine(owner, documentId, lineNo, line);
  return documentId;
}

async function insertPhotoMessage(owner: PostgresPool, { imageKey, isPhotoDeleted = false }: ExamplePaperOptions): Promise<string> {
  const { rows: [event] } = await owner.query<{ id: string }>(
    `INSERT INTO inbound_events (channel, account_id, external_event_id, external_user_id, kind, payload, status, processed_at)
     VALUES ('zalo-oa', 'seed-oa', gen_random_uuid()::text, 'seed-zalo-admin-a', 'images', '{}', 'done', now()) RETURNING id`,
  );
  const { rows: [message] } = await owner.query<{ id: string }>(
    `INSERT INTO messages (workspace_id, user_id, author, text, image_key, image_deleted_at, inbound_event_id, event_part, submission_status)
     VALUES ($1, $2, 'user', 'EXAMPLE-CAPTION', $3, CASE WHEN $4::boolean THEN now() END, $5, 0, 'accepted') RETURNING id`,
    [WORKSPACE_A_ID, A_ADMIN_USER_ID, imageKey, isPhotoDeleted, event?.id],
  );
  if (message === undefined) throw new Error('The example message was not inserted');
  return message.id;
}

async function insertDocument(owner: PostgresPool, { status = 'accepted', title = null, createdAt = null }: ExamplePaperOptions): Promise<string> {
  const { rows: [document] } = await owner.query<{ id: string }>(
    `INSERT INTO documents (workspace_id, kind, stage, status, document_number, document_date, title, vehicle_plate, summary, created_at)
     VALUES ($1, 'phiếu cân', 'dispatch', $2, 'EX0001', '2026-03-01', $3, '99Z12345', 'EXAMPLE-PAPER', COALESCE($4::timestamptz, now())) RETURNING id`,
    [WORKSPACE_A_ID, status, title, createdAt],
  );
  if (document === undefined) throw new Error('The example document was not inserted');
  return document.id;
}

async function insertIssuer(owner: PostgresPool, documentId: string, name: string): Promise<void> {
  await owner.query(
    `INSERT INTO document_parties (workspace_id, document_id, role, type, printed_name, match_key, organization_id)
     VALUES ($1, $2, 'issuer', 'company', $3, 'examplematchkey', 'aaaaaaaa-0005-4000-8000-000000000002')`,
    [WORKSPACE_A_ID, documentId, name],
  );
}

async function insertLine(owner: PostgresPool, documentId: string, lineNo: number, line: PaperLine): Promise<void> {
  const meaningId = line.meaning === null ? null : await findOrInsertMeaning(owner, line);
  await owner.query(
    `INSERT INTO document_lines (workspace_id, document_id, line_no, label, value, number, unit, at, meaning_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [WORKSPACE_A_ID, documentId, lineNo, line.label, line.value, line.number, line.unit, line.at, meaningId],
  );
}

async function findOrInsertMeaning(owner: PostgresPool, line: PaperLine): Promise<string> {
  const { rows: [meaning] } = await owner.query<{ id: string }>(
    `INSERT INTO meanings (workspace_id, value_type, name, match_key) VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, value_type, match_key) DO UPDATE SET name = excluded.name RETURNING id`,
    [WORKSPACE_A_ID, line.at === null ? 'number' : 'date', line.meaning, buildMatchKey(line.meaning ?? '')],
  );
  if (meaning === undefined) throw new Error('The example meaning was not inserted');
  return meaning.id;
}
