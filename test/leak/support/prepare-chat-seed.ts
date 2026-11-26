import type { PostgresPool } from '../../../src/providers/database/postgres.ts';
import { A_ADMIN_MEMBERSHIP_ID } from './seed-chat-ids.ts';

const BEFORE_SEEDED_HISTORY = '2026-01-01T00:00:00Z';

export async function markAdminAsJoinedBeforeHistory(owner: PostgresPool): Promise<void> {
  await owner.query('UPDATE memberships SET created_at = $2 WHERE id = $1', [A_ADMIN_MEMBERSHIP_ID, BEFORE_SEEDED_HISTORY]);
}
