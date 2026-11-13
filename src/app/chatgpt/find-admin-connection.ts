import type { AccessScope } from '../access/access-scope.ts';
import type { Database } from '../db/transaction.ts';
import { hashSecretToken } from '../internal-admin/secret-token.ts';

export type AdminConnection = { id: string; scope: AccessScope };

type AdminRow = { id: string; workspace_id: string; user_id: string };

export async function findAdminConnection(database: Database, accessToken: string, now: Date): Promise<AdminConnection | null> {
  const { rows } = await database.query<AdminRow>(
    `SELECT c.id, m.workspace_id, m.user_id FROM chatgpt_connections c
     JOIN memberships m ON m.id = c.membership_id
     WHERE c.access_token_hash = $1 AND c.access_expires_at > $2 AND m.role = 'admin'`,
    [hashSecretToken(accessToken), now],
  );
  const [admin] = rows;
  return admin ? { id: admin.id, scope: { workspaceId: admin.workspace_id, userId: admin.user_id, role: 'admin' } } : null;
}
