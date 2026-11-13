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
import { readUserMemory } from './user-memory-rows.ts';
import { insertMemberMemory, readMemberMemory } from './member-memory-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const CUSTOMER_FACT = 'Chở hàng cho nhà máy Cheng Loong';
const INVALID_FACT_RESULT = '{"ok":false,"error":"Thông tin cần lưu phải có từ 1 đến 200 ký tự và nằm trên một dòng."}';
const MEMBER_FACTS_FULL_RESULT =
  '{"ok":false,"error":"Thông tin về người này đã đủ 2000 ký tự. Tôi chưa thêm thông tin mới và vẫn giữ mọi thông tin cũ."}';
const FACT_NOT_FOUND_RESULT = '{"ok":false,"error":"Không tìm thấy thông tin này trong các thông tin đã lưu về người này."}';
const NOT_FOUND_RESULT = '{"ok":false,"error":"Không tìm thấy người này."}';

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

  it('refuses a fact that takes the facts past 2000 characters and keeps the old facts', async () => {
    const oldMarkdown = `- ${'x'.repeat(1988)}`;
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: oldMarkdown });

    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'y'.repeat(50) });

    expect(output).toBe(MEMBER_FACTS_FULL_RESULT);
    expect(await readMemberMemory(database, hungUserId)).toBe(oldMarkdown);
  });

  it('answers not found for a member id that is not a uuid', async () => {
    const output = await runTool('add_member_fact', { member_id: 'abc', fact: PLATE_FACT });

    expect(output).toBe(NOT_FOUND_RESULT);
  });

  it('answers not found for a member of another workspace and stores nothing', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const lanUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });

    const output = await runTool('add_member_fact', { member_id: await findMembershipId(lanUserId), fact: PLATE_FACT });

    expect(output).toBe(NOT_FOUND_RESULT);
    expect(await readMemberMemory(database, lanUserId)).toBeNull();
  });

  it('lists the facts of a member in saved order', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}\n- ${CUSTOMER_FACT}` });

    const output = await runTool('list_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ member: 'Hùng', facts: [PLATE_FACT, CUSTOMER_FACT] });
  });

  it('lists an empty list for a member with no facts', async () => {
    const output = await runTool('list_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ member: 'Hùng', facts: [] });
  });

  it('removes one fact and keeps the others', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}\n- ${CUSTOMER_FACT}` });

    const output = await runTool('forget_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(JSON.parse(output)).toEqual({ ok: true, member: 'Hùng', facts: [CUSTOMER_FACT] });
    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${CUSTOMER_FACT}`);
  });

  it('changes nothing when it removes a fact that is not saved', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    const output = await runTool('forget_member_fact', { member_id: hungMembershipId, fact: 'Lái xe biển số 51C-55555' });

    expect(output).toBe(FACT_NOT_FOUND_RESULT);
    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('deletes the row when it removes the last fact', async () => {
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    await runTool('forget_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(await readMemberMemory(database, hungUserId)).toBeNull();
  });

  it('removes all facts of one member and keeps the facts of another', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertMemberMemory(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });
    await insertMemberMemory(database, { workspaceId, userId: lanUserId, markdown: `- ${CUSTOMER_FACT}` });

    const output = await runTool('forget_all_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ ok: true, member: 'Hùng', facts: [] });
    expect(await readMemberMemory(database, hungUserId)).toBeNull();
    expect(await readMemberMemory(database, lanUserId)).toBe(`- ${CUSTOMER_FACT}`);
  });

  it('refuses a member who adds a fact about another member and stores nothing', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const hung: AccessScope = { workspaceId, userId: hungUserId, role: 'member' };

    const output = await runTool('add_member_fact', { member_id: await findMembershipId(lanUserId), fact: PLATE_FACT }, hung);

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
    expect(await readMemberMemory(database, lanUserId)).toBeNull();
  });

  it('leaves the private memory of the admin empty when it adds a fact about a member', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(JSON.parse(output).ok).toBe(true);
    expect(await readMemberMemory(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
    expect(await readUserMemory(database, duy.userId)).toBeNull();
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
