import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../src/app/admin-chat/tools/run-chat-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { insertMemberMemory, readMemberMemory } from './member-memory-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const INVALID_FACT_RESULT = '{"ok":false,"error":"Thông tin cần lưu phải có từ 1 đến 200 ký tự và nằm trên một dòng."}';

describe('the member fact tools of an admin in the chat', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let duy: AccessScope;
  let hungUserId: string;
  let hungMembershipId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    duy = { workspaceId, userId: duyUserId, role: 'admin' };
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
    hungMembershipId = await findMembershipId(hungUserId);
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('saves the fact on the member and answers with the facts after the change', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(output).toBe(`{"ok":true,"member":"Hùng","facts":["${PLATE_FACT}"]}`);
    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('keeps one line when the same fact is added twice', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('stores a fact trimmed', async () => {
    await runTool('add_member_fact', { member_id: hungMembershipId, fact: `  ${PLATE_FACT}  ` });

    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('refuses a fact of 201 characters and stores nothing', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'a'.repeat(201) });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readMemberMemory(database, hungUserId)).toBeNull();
  });

  it('refuses a fact with a line break and stores nothing', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'Lái xe\nbiển số 93A-1234' });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readMemberMemory(database, hungUserId)).toBeNull();
  });

  async function findMembershipId(userId: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${userId}'`);
    if (!row) throw new Error(`no membership for ${userId}`);
    return row.id;
  }

  async function runTool(name: string, args: object, scope: AccessScope = duy): Promise<string> {
    const dependencies = {
      database: pool,
      clock: new FakeClock(new Date('2026-11-02T14:05:00+07:00')),
      attachments: new PhotoAttachments(),
      sources: new SourceCards(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      guard: new AdminTextGuard(false),
    };
    return runChatTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }
});
