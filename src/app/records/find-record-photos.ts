import type { Database } from '../db/transaction.ts';

export type AttachablePhoto = { sourceMessageId: string; imageKey: string };

type PhotoRow = { source_message_id: string; image_key: string };

export async function findRecordPhotos(database: Database, recordIds: string[]): Promise<AttachablePhoto[]> {
  const { rows } = await database.query<PhotoRow>(
    `SELECT message.id AS source_message_id, message.image_key
     FROM records record JOIN messages message ON message.id = record.message_id
     WHERE record.id = ANY($1::uuid[])`,
    [recordIds],
  );
  return rows.map((row) => ({ sourceMessageId: row.source_message_id, imageKey: row.image_key }));
}
