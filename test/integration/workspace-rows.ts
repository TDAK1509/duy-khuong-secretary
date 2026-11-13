import { addCredits } from '../../src/app/credits/credit-balance.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { hashInviteCode } from '../../src/app/workspaces/invite-code.ts';
import { createPostgresPool } from '../../src/providers/database/postgres.ts';
import { literal, timestamp } from './sql-literals.ts';
import type { TemporaryDatabase } from './temporary-database.ts';

const STARTING_CREDITS = '20000.000';

export async function insertWorkspace(database: TemporaryDatabase, name: string): Promise<string> {
  const id = await insertWorkspaceWithoutCredits(database, name);
  await grantStartingCredits(database, id);
  return id;
}

export async function insertWorkspaceWithoutCredits(database: TemporaryDatabase, name: string): Promise<string> {
  const [row] = await database.query<{ id: string }>(`INSERT INTO workspaces (name) VALUES (${literal(name)}) RETURNING id`);
  if (!row) throw new Error('workspace not inserted');
  return row.id;
}

async function grantStartingCredits(database: TemporaryDatabase, workspaceId: string): Promise<void> {
  const pool = createPostgresPool(database.url);
  try {
    await runInTransaction(pool, (transaction) =>
      addCredits(transaction, { workspaceId, credits: STARTING_CREDITS, source: 'starting_grant', addedBy: null, note: 'Credit ban đầu' }),
    );
  } finally {
    await pool.end();
  }
}

export type NewInvite = {
  workspaceId: string;
  code: string;
  displayName: string;
  role: 'admin' | 'member';
  expiresAt?: Date;
  createdBy?: string;
};

const DEFAULT_LAST_INBOUND_AT = new Date('2026-10-01T10:00:00+07:00');
const FAR_FUTURE = new Date('2026-12-01T00:00:00+07:00');

export async function insertInvite(database: TemporaryDatabase, invite: NewInvite): Promise<void> {
  await database.query(
    `INSERT INTO workspace_invites (workspace_id, code_hash, display_name, role, created_by, expires_at)
     VALUES (${literal(invite.workspaceId)}, ${literal(hashInviteCode(invite.code))}, ${literal(invite.displayName)},
       ${literal(invite.role)}, ${invite.createdBy ? literal(invite.createdBy) : 'NULL'}, ${timestamp(invite.expiresAt ?? FAR_FUTURE)})`,
  );
}

export type NewMember = {
  workspaceId: string;
  externalUserId: string;
  displayName: string;
  role?: 'admin' | 'member';
  joinedAt?: Date;
  lastInboundAt?: Date;
};

export async function insertMember(database: TemporaryDatabase, member: NewMember): Promise<string> {
  const [user] = await database.query<{ id: string }>(
    `INSERT INTO users DEFAULT VALUES RETURNING id`,
  );
  if (!user) throw new Error('user not inserted');
  await insertMembership(database, { ...member, userId: user.id });
  await database.query(
    `INSERT INTO channel_identities (channel, account_id, external_user_id, user_id, current_workspace_id, last_inbound_at)
     VALUES ('zalo-oa', 'oa-1', ${literal(member.externalUserId)}, ${literal(user.id)}, ${literal(member.workspaceId)},
       ${timestamp(member.lastInboundAt ?? DEFAULT_LAST_INBOUND_AT)})
     ON CONFLICT (channel, account_id, external_user_id) DO NOTHING`,
  );
  return user.id;
}

export type NewMembership = {
  workspaceId: string;
  userId: string;
  displayName: string;
  role?: 'admin' | 'member';
  joinedAt?: Date;
};

export async function insertMembership(database: TemporaryDatabase, membership: NewMembership): Promise<void> {
  await database.query(
    `INSERT INTO memberships (workspace_id, user_id, role, display_name, created_at)
     VALUES (${literal(membership.workspaceId)}, ${literal(membership.userId)}, ${literal(membership.role ?? 'member')},
       ${literal(membership.displayName)}, ${timestamp(membership.joinedAt ?? new Date('2026-10-01T10:00:00+07:00'))})`,
  );
}
