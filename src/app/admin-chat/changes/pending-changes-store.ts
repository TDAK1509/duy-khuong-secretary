import type { Database, Transaction } from '../../db/transaction.ts';
import { readStoredCalls, type StoredCall } from './stored-call.ts';

const QUESTION_LIFETIME_MS = 24 * 60 * 60 * 1000;

type Owner = { workspaceId: string; userId: string };

export async function replacePendingChanges(transaction: Transaction, owner: Owner, calls: StoredCall[], now: Date): Promise<void> {
  await transaction.query(
    `INSERT INTO pending_changes (workspace_id, user_id, calls, created_at) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET calls = EXCLUDED.calls, created_at = EXCLUDED.created_at`,
    [owner.workspaceId, owner.userId, JSON.stringify(calls), now],
  );
}

export async function takePendingChanges(database: Database, owner: Owner, now: Date): Promise<StoredCall[]> {
  const { rows } = await database.query<{ calls: unknown; created_at: Date }>(
    'DELETE FROM pending_changes WHERE workspace_id = $1 AND user_id = $2 RETURNING calls, created_at',
    [owner.workspaceId, owner.userId],
  );
  const [row] = rows;
  const isOpen = row !== undefined && row.created_at.getTime() > now.getTime() - QUESTION_LIFETIME_MS;
  return isOpen ? readStoredCalls(row.calls) : [];
}

export async function dropPendingChanges(database: Database, owner: Owner): Promise<void> {
  await database.query('DELETE FROM pending_changes WHERE workspace_id = $1 AND user_id = $2', [owner.workspaceId, owner.userId]);
}
