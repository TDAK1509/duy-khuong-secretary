import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../src/app/admin-chat/tools/run-chat-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertUserMemory, readUserMemory } from './user-memory-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const INVALID_FACT_RESULT = '{"ok":false,"error":"Điều cần nhớ phải có từ 1 đến 200 ký tự và nằm trên một dòng."}';
const MEMORY_FULL_RESULT = '{"ok":false,"error":"Bản ghi nhớ đã đủ 2000 ký tự. Tôi chưa thêm điều mới và vẫn giữ mọi điều cũ."}';

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

  it('stores the memory of an admin under the owner scope of the admin', async () => {
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });

    const output = await runTool('remember', { fact: 'Tôi thích câu trả lời thật ngắn' }, { workspaceId, userId: duyUserId, role: 'admin' });

    expect(JSON.parse(output).ok).toBe(true);
    expect(await readUserMemory(database, duyUserId)).toBe('- Tôi thích câu trả lời thật ngắn');
  });

  async function runTool(name: string, args: object, scope: AccessScope = lan): Promise<string> {
    const dependencies = {
      database: runtimePool,
      clock: new FakeClock(new Date('2026-11-02T14:05:00+07:00')),
      attachments: new PhotoAttachments(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      nameReview: new NameReviewRequest(),
      guard: new AdminTextGuard(false),
    };
    return runChatTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
