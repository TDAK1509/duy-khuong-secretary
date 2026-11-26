import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_USER_ID, WORKSPACE_A_ID } from '../support/seed-ids.ts';

export async function countHeldChanges(owner: PostgresPool): Promise<number> {
  const { rows } = await owner.query<{ held: number }>(
    'SELECT COALESCE(sum(jsonb_array_length(calls)), 0)::int AS held FROM pending_changes WHERE workspace_id = $1 AND user_id = $2',
    [WORKSPACE_A_ID, A_ADMIN_USER_ID],
  );
  return rows[0]?.held ?? 0;
}

export async function listReplyPhotoKeys(owner: PostgresPool, askedMessageId: string): Promise<string[]> {
  const { rows } = await owner.query<{ image_key: string }>(
    `SELECT source.image_key
     FROM reply_photos photo
     JOIN messages reply ON reply.id = photo.reply_message_id
     JOIN messages source ON source.id = photo.source_message_id
     WHERE reply.reply_to = $1 AND source.image_key IS NOT NULL
     ORDER BY source.image_key`,
    [askedMessageId],
  );
  return rows.map((row) => row.image_key);
}
