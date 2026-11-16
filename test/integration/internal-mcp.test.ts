import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createOwnerReadPool } from '../../src/bootstrap/owner-read-pool.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';
import { insertInternalSession, makeUserInternal } from './internal-user-rows.ts';
import { BEARER_TOKEN, callListMembers, callListUsers, callListWorkspaces, callSearchRecords, listTools, parseToolResult, postMcp } from './internal-mcp-requests.ts';
import { insertRecordRow } from './record-rows.ts';
import { getAdminPage, SESSION_TOKEN } from './internal-admin-requests.ts';

const NOW = new Date('2026-11-02T10:00:00+07:00');
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const TOOLS_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

describe('POST /mcp authentication', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let ownerPool: PostgresPool;
  let clock: FakeClock;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    ownerPool = createOwnerReadPool(database.url);
    clock = new FakeClock(NOW);
    const workspaceId = await insertWorkspace(database, 'Nhóm thử nghiệm');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-test', displayName: 'Tester', role: 'admin' });
  });

  afterEach(async () => {
    await pool.end();
    await ownerPool.end();
    await database.drop();
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const response = await postMcp(pool, ownerPool, clock, TOOLS_LIST_BODY, null);

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for a bearer token with no matching session', async () => {
    const response = await postMcp(pool, ownerPool, clock, TOOLS_LIST_BODY, 'unknown-token');

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for a session belonging to a non-internal user', async () => {
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });

    const response = await postMcp(pool, ownerPool, clock, TOOLS_LIST_BODY);

    expect(response.statusCode).toBe(403);
  });

  it('returns 401 for an expired session', async () => {
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() - ONE_MINUTE_MS) });

    const response = await postMcp(pool, ownerPool, clock, TOOLS_LIST_BODY);

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /mcp tools', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let ownerPool: PostgresPool;
  let clock: FakeClock;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    ownerPool = createOwnerReadPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Nhóm A');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await ownerPool.end();
    await database.drop();
  });

  it('lists two tools: list_users and list_workspaces', async () => {
    const response = await listTools(pool, ownerPool, clock);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain('list_users');
    expect(names).toContain('list_workspaces');
  });

  it('returns users from all workspaces with their memberships', async () => {
    const workspaceBId = await insertWorkspace(database, 'Nhóm B');
    const otherUserId = await insertMember(database, { workspaceId: workspaceBId, externalUserId: 'zu-lan', displayName: 'Lan', role: 'member' });

    const response = await callListUsers(pool, ownerPool, clock);
    const data = parseToolResult(response.body) as { items: { id: string; memberships: { workspace_id: string }[] }[] };

    expect(response.statusCode).toBe(200);
    const ids = data.items.map((u) => u.id);
    expect(ids).toContain(userId);
    expect(ids).toContain(otherUserId);
    const duy = data.items.find((u) => u.id === userId);
    expect(duy?.memberships[0]?.workspace_id).toBe(workspaceId);
  });

  it('filters users by workspace_id', async () => {
    const workspaceBId = await insertWorkspace(database, 'Nhóm B');
    const otherUserId = await insertMember(database, { workspaceId: workspaceBId, externalUserId: 'zu-lan', displayName: 'Lan' });

    const response = await callListUsers(pool, ownerPool, clock, { workspace_id: workspaceId });
    const data = parseToolResult(response.body) as { items: { id: string }[] };

    expect(data.items.map((u) => u.id)).toContain(userId);
    expect(data.items.map((u) => u.id)).not.toContain(otherUserId);
  });

  it('filters users by is_internal', async () => {
    const workspaceBId = await insertWorkspace(database, 'Nhóm B');
    const nonInternalId = await insertMember(database, { workspaceId: workspaceBId, externalUserId: 'zu-lan', displayName: 'Lan' });

    const response = await callListUsers(pool, ownerPool, clock, { is_internal: true });
    const data = parseToolResult(response.body) as { items: { id: string }[] };

    expect(data.items.map((u) => u.id)).toContain(userId);
    expect(data.items.map((u) => u.id)).not.toContain(nonInternalId);
  });

  it('filters users by Vietnam-timezone created_from and created_to dates', async () => {
    await database.query(
      `UPDATE users SET created_at = '2026-10-31T17:00:00Z' WHERE id = '${userId}'`,
    );
    const workspaceBId = await insertWorkspace(database, 'Nhóm B');
    const lateUserId = await insertMember(database, { workspaceId: workspaceBId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await database.query(
      `UPDATE users SET created_at = '2026-11-01T17:01:00Z' WHERE id = '${lateUserId}'`,
    );

    const onNov1 = await callListUsers(pool, ownerPool, clock, { created_from: '2026-11-01', created_to: '2026-11-01' });
    const data = parseToolResult(onNov1.body) as { items: { id: string }[] };

    expect(data.items.map((u) => u.id)).toContain(userId);
    expect(data.items.map((u) => u.id)).not.toContain(lateUserId);
  });

  it('paginates 51 users into a first page of 50 with a next_cursor', async () => {
    for (let i = 1; i <= 50; i += 1) {
      const wsId = await insertWorkspace(database, `Nhóm ${i}`);
      await insertMember(database, { workspaceId: wsId, externalUserId: `zu-extra-${i}`, displayName: `User ${i}` });
    }

    const response = await callListUsers(pool, ownerPool, clock, { limit: 50 });
    const data = parseToolResult(response.body) as { items: unknown[]; next_cursor: string | null };

    expect(data.items).toHaveLength(50);
    expect(data.next_cursor).not.toBeNull();
  });

  it('returns no items on the second page when only 51 users exist', async () => {
    for (let i = 1; i <= 50; i += 1) {
      const wsId = await insertWorkspace(database, `Nhóm ${i}`);
      await insertMember(database, { workspaceId: wsId, externalUserId: `zu-extra-${i}`, displayName: `User ${i}` });
    }

    const firstPage = await callListUsers(pool, ownerPool, clock, { limit: 50 });
    const firstData = parseToolResult(firstPage.body) as { items: unknown[]; next_cursor: string };

    const secondPage = await callListUsers(pool, ownerPool, clock, { limit: 50, cursor: firstData.next_cursor });
    const secondData = parseToolResult(secondPage.body) as { items: unknown[]; next_cursor: string | null };

    expect(secondData.items).toHaveLength(1);
    expect(secondData.next_cursor).toBeNull();
  });

  it('rejects INSERT on the owner pool with read_only_sql_transaction', async () => {
    await expect(ownerPool.query('INSERT INTO workspaces (name) VALUES ($1)', ['test'])).rejects.toMatchObject({
      code: '25006',
    });
  });
});

describe('POST /mcp list_workspaces tool', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let ownerPool: PostgresPool;
  let clock: FakeClock;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    ownerPool = createOwnerReadPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Nhóm Alpha');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await ownerPool.end();
    await database.drop();
  });

  it('returns workspaces with id, name, credit_balance, created_at, and member_count', async () => {
    const response = await callListWorkspaces(pool, ownerPool, clock);
    const data = parseToolResult(response.body) as { items: { id: string; name: string; credit_balance: string; created_at: string; member_count: number }[] };

    expect(response.statusCode).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.id).toBe(workspaceId);
    expect(data.items[0]?.name).toBe('Nhóm Alpha');
    expect(typeof data.items[0]?.credit_balance).toBe('string');
    expect(data.items[0]?.member_count).toBe(1);
  });

  it('filters workspaces by name (case-insensitive substring)', async () => {
    await insertWorkspace(database, 'Nhóm Beta');

    const response = await callListWorkspaces(pool, ownerPool, clock, { name: 'alpha' });
    const data = parseToolResult(response.body) as { items: { name: string }[] };

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.name).toBe('Nhóm Alpha');
  });

  it('filters workspaces by Vietnam-timezone created_from and created_to dates', async () => {
    await database.query(`UPDATE workspaces SET created_at = '2026-10-31T17:00:00Z' WHERE id = '${workspaceId}'`);
    const laterId = await insertWorkspace(database, 'Nhóm Gamma');
    await database.query(`UPDATE workspaces SET created_at = '2026-11-01T17:01:00Z' WHERE id = '${laterId}'`);

    const onNov1 = await callListWorkspaces(pool, ownerPool, clock, { created_from: '2026-11-01', created_to: '2026-11-01' });
    const data = parseToolResult(onNov1.body) as { items: { id: string }[] };

    expect(data.items.map((w) => w.id)).toContain(workspaceId);
    expect(data.items.map((w) => w.id)).not.toContain(laterId);
  });

  it('paginates 51 workspaces into a first page of 50 with a next_cursor', async () => {
    for (let i = 1; i <= 50; i += 1) {
      await insertWorkspace(database, `Extra ${i}`);
    }

    const response = await callListWorkspaces(pool, ownerPool, clock, { limit: 50 });
    const data = parseToolResult(response.body) as { items: unknown[]; next_cursor: string | null };

    expect(data.items).toHaveLength(50);
    expect(data.next_cursor).not.toBeNull();
  });

  it('returns the remaining item on the second page when 51 workspaces exist', async () => {
    for (let i = 1; i <= 50; i += 1) {
      await insertWorkspace(database, `Extra ${i}`);
    }

    const firstPage = await callListWorkspaces(pool, ownerPool, clock, { limit: 50 });
    const firstData = parseToolResult(firstPage.body) as { items: unknown[]; next_cursor: string };

    const secondPage = await callListWorkspaces(pool, ownerPool, clock, { limit: 50, cursor: firstData.next_cursor });
    const secondData = parseToolResult(secondPage.body) as { items: unknown[]; next_cursor: string | null };

    expect(secondData.items).toHaveLength(1);
    expect(secondData.next_cursor).toBeNull();
  });
});

describe('POST /mcp search_records tool', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let ownerPool: PostgresPool;
  let clock: FakeClock;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    ownerPool = createOwnerReadPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Nhóm Alpha');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await ownerPool.end();
    await database.drop();
  });

  it('returns records with workspace_id, id, member, category, summary, and has_photo', async () => {
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', summary: 'Đổ xăng', category: 'đổ xăng dầu' });

    const response = await callSearchRecords(pool, ownerPool, clock);
    const data = parseToolResult(response.body) as { items: { id: string; workspace_id: string; member: string; summary: string; has_photo: boolean }[] };

    expect(response.statusCode).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.workspace_id).toBe(workspaceId);
    expect(data.items[0]?.member).toBe('Duy');
    expect(data.items[0]?.has_photo).toBe(false);
  });

  it('filters records by workspace_id', async () => {
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', summary: 'Alpha record' });
    const otherWorkspaceId = await insertWorkspace(database, 'Nhóm Beta');
    const otherUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: otherUserId, senderName: 'Lan', summary: 'Beta record' });

    const response = await callSearchRecords(pool, ownerPool, clock, { workspace_id: workspaceId });
    const data = parseToolResult(response.body) as { items: { workspace_id: string }[] };

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.workspace_id).toBe(workspaceId);
  });

  it('paginates 51 records into a first page of 50 with a next_cursor', async () => {
    for (let i = 1; i <= 51; i += 1) {
      await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', summary: `Mục ${i}`, itemIndex: i - 1 });
    }

    const response = await callSearchRecords(pool, ownerPool, clock, { limit: 50 });
    const data = parseToolResult(response.body) as { items: unknown[]; next_cursor: string | null };

    expect(data.items).toHaveLength(50);
    expect(data.next_cursor).not.toBeNull();
  });
});

describe('POST /mcp list_members tool', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let ownerPool: PostgresPool;
  let clock: FakeClock;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    ownerPool = createOwnerReadPool(database.url);
    clock = new FakeClock(NOW);
    workspaceId = await insertWorkspace(database, 'Nhóm Alpha');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: BEARER_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await ownerPool.end();
    await database.drop();
  });

  it('returns members of a workspace with user_id, display_name, role, joined_at, and zalo_name', async () => {
    const response = await callListMembers(pool, ownerPool, clock, { workspace_id: workspaceId });
    const data = parseToolResult(response.body) as { items: { user_id: string; display_name: string; role: string; joined_at: string; zalo_name: string | null }[] };

    expect(response.statusCode).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.user_id).toBe(userId);
    expect(data.items[0]?.display_name).toBe('Duy');
    expect(data.items[0]?.role).toBe('admin');
    expect(typeof data.items[0]?.joined_at).toBe('string');
  });

  it('filters members by role', async () => {
    const memberId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan', role: 'member' });

    const response = await callListMembers(pool, ownerPool, clock, { workspace_id: workspaceId, role: 'member' });
    const data = parseToolResult(response.body) as { items: { user_id: string }[] };

    expect(data.items.map((m) => m.user_id)).toContain(memberId);
    expect(data.items.map((m) => m.user_id)).not.toContain(userId);
  });

  it('paginates 51 members into a first page of 50 with a next_cursor', async () => {
    for (let i = 1; i <= 50; i += 1) {
      await insertMember(database, { workspaceId, externalUserId: `zu-extra-${i}`, displayName: `User ${i}`, role: 'member' });
    }

    const response = await callListMembers(pool, ownerPool, clock, { workspace_id: workspaceId, limit: 50 });
    const data = parseToolResult(response.body) as { items: unknown[]; next_cursor: string | null };

    expect(data.items).toHaveLength(50);
    expect(data.next_cursor).not.toBeNull();
  });

  it('returns an error when workspace_id is missing', async () => {
    const response = await callListMembers(pool, ownerPool, clock, {});
    const result = JSON.parse(response.body) as { result: { isError: boolean } };

    expect(response.statusCode).toBe(200);
    expect(result.result.isError).toBe(true);
  });
});

describe('admin dashboard MCP bearer token', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let clock: FakeClock;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    clock = new FakeClock(NOW);
    const workspaceId = await insertWorkspace(database, 'Nhóm thử nghiệm');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-test', displayName: 'Tester', role: 'admin' });
    await makeUserInternal(database, userId);
    await insertInternalSession(database, { userId, token: SESSION_TOKEN, expiresAt: new Date(NOW.getTime() + ONE_HOUR_MS) });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('shows the session token as the MCP bearer token on the dashboard', async () => {
    const response = await getAdminPage(pool, clock, '/admin');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(SESSION_TOKEN);
  });
});
