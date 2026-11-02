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

export type NewMember = {
  workspaceId: string;
  externalUserId: string;
  displayName: string;
  role?: 'admin' | 'member';
  joinedAt?: Date;
};

export async function insertMember(database: TemporaryDatabase, member: NewMember): Promise<string> {
  const [user] = await database.query<{ id: string }>(
    `INSERT INTO users DEFAULT VALUES RETURNING id`,
  );
  if (!user) throw new Error('user not inserted');
  await database.query(
    `INSERT INTO memberships (workspace_id, user_id, role, display_name, created_at)
     VALUES (${literal(member.workspaceId)}, ${literal(user.id)}, ${literal(member.role ?? 'member')}, ${literal(member.displayName)},
       ${timestamp(member.joinedAt ?? new Date('2026-10-01T10:00:00+07:00'))})`,
  );
  await database.query(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, user_id, current_workspace_id, last_inbound_at)
     VALUES ('zalo-oa', 'oa-1', ${literal(member.externalUserId)}, ${literal(user.id)}, ${literal(member.workspaceId)},
       ${timestamp(new Date('2026-10-01T10:00:00+07:00'))})
     ON CONFLICT (channel, account_id, external_user_id) DO NOTHING`,
  );
  return user.id;
}
