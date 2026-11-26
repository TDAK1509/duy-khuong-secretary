import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_SENDER } from './seed-chat-ids.ts';

export async function listAdminOutboundMessages(owner: PostgresPool): Promise<unknown[]> {
  const { rows } = await owner.query<{ row: unknown }>('SELECT to_jsonb(message) AS row FROM outbound_messages message WHERE external_user_id = $1 ORDER BY id', [A_ADMIN_SENDER.externalUserId]);
  return rows.map(({ row }) => row);
}
