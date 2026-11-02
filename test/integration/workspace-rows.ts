import { hashInviteCode } from '../../src/app/workspaces/invite-code.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

export async function insertWorkspace(database: TemporaryDatabase, name: string): Promise<string> {
  const [row] = await database.query<{ id: string }>(`INSERT INTO workspaces (name) VALUES (${literal(name)}) RETURNING id`);
  if (!row) throw new Error('workspace not inserted');
  return row.id;
}

export type NewInvite = {
  workspaceId: string;
  code: string;
  displayName: string;
  role: 'admin' | 'member';
  expiresAt?: Date;
};

const FAR_FUTURE = new Date('2026-12-01T00:00:00+07:00');

export async function insertInvite(database: TemporaryDatabase, invite: NewInvite): Promise<void> {
  await database.query(
    `INSERT INTO workspace_invites (workspace_id, code_hash, display_name, role, expires_at)
     VALUES (${literal(invite.workspaceId)}, ${literal(hashInviteCode(invite.code))}, ${literal(invite.displayName)},
       ${literal(invite.role)}, ${timestamp(invite.expiresAt ?? FAR_FUTURE)})`,
  );
}
