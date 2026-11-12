import { setTimeout } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../src/app/admin-chat/tools/run-chat-tool.ts';
import { removeMember } from '../../src/app/workspaces/remove-member.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertUserMemory, readUserMemory } from './user-memory-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const INVALID_FACT_RESULT = '{"ok":false,"error":"Điều cần nhớ phải có từ 1 đến 200 ký tự và nằm trên một dòng."}';
const MEMORY_FULL_RESULT = '{"ok":false,"error":"Bản ghi nhớ đã đủ 2000 ký tự. Tôi chưa thêm điều mới và vẫn giữ mọi điều cũ."}';

const MAX_WAIT_ATTEMPTS = 50;
const WAIT_STEP_MS = 40;

describe('the memory tools of a user in the chat', () => {
  let database: TemporaryDatabase;
  let runtimePool: PostgresPool;
  let workspaceId: string;
  let lan: AccessScope;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    lan = { workspaceId, userId: lanUserId, role: 'member' };
  });

  afterEach(async () => {
    await runtimePool.end();
    await database.drop();
  });

  it('adds one Markdown line when it remembers a fact', async () => {
    const output = await runTool('remember', { fact: 'Tôi lái xe 29C-123.45' });

    expect(JSON.parse(output)).toEqual({ ok: true, markdown: '- Tôi lái xe 29C-123.45' });
    expect(await readUserMemory(database, lan.userId)).toBe('- Tôi lái xe 29C-123.45');
  });

  it('changes nothing when it remembers the same fact again', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- Tôi lái xe 29C-123.45' });

    const output = await runTool('remember', { fact: 'Tôi lái xe 29C-123.45' });

    expect(JSON.parse(output)).toEqual({ ok: true, markdown: '- Tôi lái xe 29C-123.45' });
    expect(await readUserMemory(database, lan.userId)).toBe('- Tôi lái xe 29C-123.45');
  });

  it('refuses a fact of 201 characters and stores nothing', async () => {
    const output = await runTool('remember', { fact: 'a'.repeat(201) });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readUserMemory(database, lan.userId)).toBeNull();
  });

  it('refuses a fact with a line break and stores nothing', async () => {
    const output = await runTool('remember', { fact: 'a\nb' });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readUserMemory(database, lan.userId)).toBeNull();
  });

  it('accepts a memory of exactly 2000 characters', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: `- ${'x'.repeat(1988)}` });

    const output = await runTool('remember', { fact: 'y'.repeat(7) });

    expect(JSON.parse(output).ok).toBe(true);
    expect((await readUserMemory(database, lan.userId))?.length).toBe(2000);
  });

  it('refuses a fact that takes the memory past 2000 characters and keeps the old facts', async () => {
    const oldMemory = `- ${'x'.repeat(1988)}`;
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: oldMemory });

    const output = await runTool('remember', { fact: 'y'.repeat(8) });

    expect(output).toBe(MEMORY_FULL_RESULT);
    expect(await readUserMemory(database, lan.userId)).toBe(oldMemory);
  });

  it('forgets only the line that matches', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- A\n- B' });

    const output = await runTool('forget', { fact: 'A' });

    expect(JSON.parse(output)).toEqual({ ok: true, markdown: '- B' });
    expect(await readUserMemory(database, lan.userId)).toBe('- B');
  });

  it('gives an error when it forgets a fact that is not remembered and keeps the memory', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- A' });

    const output = await runTool('forget', { fact: 'C' });

    expect(output).toBe('{"ok":false,"error":"Không tìm thấy điều này trong bản ghi nhớ."}');
    expect(await readUserMemory(database, lan.userId)).toBe('- A');
  });

  it('deletes the row when it forgets the last line', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- A' });

    const output = await runTool('forget', { fact: 'A' });

    expect(JSON.parse(output)).toEqual({ ok: true, markdown: '' });
    expect(await readUserMemory(database, lan.userId)).toBeNull();
  });

  it('deletes the row when it forgets all', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- A\n- B' });

    const output = await runTool('forget_all', {});

    expect(JSON.parse(output)).toEqual({ ok: true, markdown: '' });
    expect(await readUserMemory(database, lan.userId)).toBeNull();
  });

  it('keeps both facts when two remembers wait on the same lock', async () => {
    const lockHolder = await runtimePool.connect();
    await lockHolder.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`user_memories:${workspaceId}:${lan.userId}`]);
    const remembers = Promise.all([runTool('remember', { fact: 'A' }), runTool('remember', { fact: 'B' })]);
    try {
      await waitForWaitingAdvisoryLocks(2);
    } finally {
      await lockHolder.query('SELECT pg_advisory_unlock_all()');
      lockHolder.release();
    }

    const outputs = await remembers;

    expect(outputs.map((output) => JSON.parse(output).ok)).toEqual([true, true]);
    expect((await readUserMemory(database, lan.userId))?.split('\n').sort()).toEqual(['- A', '- B']);
  });

  it('deletes the memory of a member that an admin removes', async () => {
    await insertUserMemory(database, { workspaceId, userId: lan.userId, markdown: '- A' });
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    const [lanMembership] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${lan.userId}'`);

    await removeMember(runtimePool, { workspaceId, callerUserId: duyUserId, membershipId: lanMembership?.id ?? '' });

    expect(await readUserMemory(database, lan.userId)).toBeNull();
  });

  it('stores the memory of an admin under the owner scope of the admin', async () => {
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });

    const output = await runTool('remember', { fact: 'Tôi thích câu trả lời thật ngắn' }, { workspaceId, userId: duyUserId, role: 'admin' });

    expect(JSON.parse(output).ok).toBe(true);
    expect(await readUserMemory(database, duyUserId)).toBe('- Tôi thích câu trả lời thật ngắn');
  });

  async function waitForWaitingAdvisoryLocks(count: number): Promise<void> {
    for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt += 1) {
      const [row] = await database.query<{ waiting: string }>(
        `SELECT count(*) AS waiting FROM pg_locks
         WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      );
      if (Number(row?.waiting) === count) return;
      await setTimeout(WAIT_STEP_MS);
    }
    throw new Error(`${count} remembers did not wait on the advisory lock`);
  }

  async function runTool(name: string, args: object, scope: AccessScope = lan): Promise<string> {
    const dependencies = {
      database: runtimePool,
      clock: new FakeClock(new Date('2026-11-02T14:05:00+07:00')),
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      nameReview: new NameReviewRequest(),
      guard: new AdminTextGuard(false),
    };
    return runChatTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
