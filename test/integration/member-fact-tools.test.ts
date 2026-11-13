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
import { readPrivateMemory } from './private-memory-rows.ts';
import { insertMemberFact, insertSharedMemberFacts, readMemberFacts } from './member-fact-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const CUSTOMER_FACT = 'Chở hàng cho nhà máy Cheng Loong';
const INVALID_FACT_RESULT = '{"ok":false,"error":"Thông tin cần lưu phải có từ 1 đến 200 ký tự và nằm trên một dòng."}';
const MEMBER_FACTS_FULL_RESULT =
  '{"ok":false,"error":"Thông tin về người này đã đủ 2000 ký tự. Tôi chưa thêm thông tin mới và vẫn giữ mọi thông tin cũ."}';
const FACT_NOT_FOUND_RESULT = '{"ok":false,"error":"Không tìm thấy thông tin này trong các thông tin đã lưu về người này."}';
const SHARED = 'admins_and_member';
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

  it('saves the fact with its author and says who can read it', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT, readers: SHARED });

    expect(JSON.parse(output)).toEqual({
      ok: true,
      member: 'Hùng',
      facts: [{ fact: PLATE_FACT, readers: SHARED }],
      note: 'Các quản lý và Hùng xem được thông tin này. Hệ thống dùng thông tin này khi đọc ảnh và tin nhắn Hùng gửi.',
    });
    expect(await database.query('SELECT member_user_id, author_user_id, readers, fact FROM member_facts')).toEqual([
      { member_user_id: hungUserId, author_user_id: duy.userId, readers: SHARED, fact: PLATE_FACT },
    ]);
  });

  it('says that the system does not use a fact that only the admins can read', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT, readers: 'admins' });

    expect(JSON.parse(output).note).toBe('Chỉ các quản lý xem được thông tin này. Hệ thống không dùng thông tin này khi đọc ảnh và tin nhắn Hùng gửi.');
  });

  it('tells the author that only they can read a fact saved for the author only', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT, readers: 'author' });

    expect(JSON.parse(output).note).toMatch(/^Chỉ bạn xem được thông tin này\./);
  });

  it('keeps one line when the same fact is added twice', async () => {
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT, readers: SHARED });

    expect(await readMemberFacts(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('stores a fact trimmed', async () => {
    await runTool('add_member_fact', { member_id: hungMembershipId, fact: `  ${PLATE_FACT}  `, readers: SHARED });

    expect(await readMemberFacts(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('refuses a fact of 201 characters and stores nothing', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'a'.repeat(201), readers: SHARED });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readMemberFacts(database, hungUserId)).toBeNull();
  });

  it('refuses a fact with a line break and stores nothing', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'Lái xe\nbiển số 93A-1234', readers: SHARED });

    expect(output).toBe(INVALID_FACT_RESULT);
    expect(await readMemberFacts(database, hungUserId)).toBeNull();
  });

  it('refuses a fact that takes the facts past 2000 characters and keeps the old facts', async () => {
    const oldMarkdown = `- ${'x'.repeat(1988)}`;
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: oldMarkdown });

    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: 'y'.repeat(50), readers: SHARED });

    expect(output).toBe(MEMBER_FACTS_FULL_RESULT);
    expect(await readMemberFacts(database, hungUserId)).toBe(oldMarkdown);
  });

  it('answers not found for a member id that is not a uuid', async () => {
    const output = await runTool('add_member_fact', { member_id: 'abc', fact: PLATE_FACT, readers: SHARED });

    expect(output).toBe(NOT_FOUND_RESULT);
  });

  it('answers not found for a member of another workspace and stores nothing', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải khác');
    const lanUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });

    const output = await runTool('add_member_fact', { member_id: await findMembershipId(lanUserId), fact: PLATE_FACT, readers: SHARED });

    expect(output).toBe(NOT_FOUND_RESULT);
    expect(await readMemberFacts(database, lanUserId)).toBeNull();
  });

  it('lists the facts of a member in saved order', async () => {
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}\n- ${CUSTOMER_FACT}` });

    const output = await runTool('list_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ member: 'Hùng', facts: [shared(PLATE_FACT), shared(CUSTOMER_FACT)] });
  });

  it('lists to another admin only the facts that admin may read', async () => {
    await insertMemberFact(database, { workspaceId, memberUserId: hungUserId, authorUserId: duy.userId, readers: 'author', fact: 'Chỉ Duy xem' });
    await insertMemberFact(database, { workspaceId, memberUserId: hungUserId, authorUserId: duy.userId, readers: 'admins', fact: 'Các quản lý xem' });
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: '- Thông tin cũ' });
    const lan = await insertAdminLan();

    const output = await runTool('list_member_facts', { member_id: hungMembershipId }, lan);

    expect(JSON.parse(output).facts).toEqual([{ fact: 'Các quản lý xem', readers: 'admins' }, shared('Thông tin cũ')]);
  });

  it('lists an empty list for a member with no facts', async () => {
    const output = await runTool('list_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ member: 'Hùng', facts: [] });
  });

  it('removes one fact and keeps the others', async () => {
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}\n- ${CUSTOMER_FACT}` });

    const output = await runTool('forget_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(JSON.parse(output)).toEqual({ ok: true, member: 'Hùng', facts: [shared(CUSTOMER_FACT)] });
    expect(await readMemberFacts(database, hungUserId)).toBe(`- ${CUSTOMER_FACT}`);
  });

  it('changes nothing when it removes a fact that is not saved', async () => {
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    const output = await runTool('forget_member_fact', { member_id: hungMembershipId, fact: 'Lái xe biển số 51C-55555' });

    expect(output).toBe(FACT_NOT_FOUND_RESULT);
    expect(await readMemberFacts(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
  });

  it('refuses another admin who forgets a fact hidden from that admin', async () => {
    await insertMemberFact(database, { workspaceId, memberUserId: hungUserId, authorUserId: duy.userId, readers: 'author', fact: 'Chỉ Duy xem' });
    const lan = await insertAdminLan();

    const output = await runTool('forget_member_fact', { member_id: hungMembershipId, fact: 'Chỉ Duy xem' }, lan);

    expect(output).toBe(FACT_NOT_FOUND_RESULT);
    expect(await readMemberFacts(database, hungUserId)).toBe('- Chỉ Duy xem');
  });

  it('deletes the row when it removes the last fact', async () => {
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });

    await runTool('forget_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT });

    expect(await readMemberFacts(database, hungUserId)).toBeNull();
  });

  it('removes all facts of one member and keeps the facts of another', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertSharedMemberFacts(database, { workspaceId, userId: hungUserId, markdown: `- ${PLATE_FACT}` });
    await insertSharedMemberFacts(database, { workspaceId, userId: lanUserId, markdown: `- ${CUSTOMER_FACT}` });

    const output = await runTool('forget_all_member_facts', { member_id: hungMembershipId });

    expect(JSON.parse(output)).toEqual({ ok: true, member: 'Hùng', facts: [] });
    expect(await readMemberFacts(database, hungUserId)).toBeNull();
    expect(await readMemberFacts(database, lanUserId)).toBe(`- ${CUSTOMER_FACT}`);
  });

  it('keeps the facts hidden from the admin when the admin forgets all facts of a member', async () => {
    await insertMemberFact(database, { workspaceId, memberUserId: hungUserId, authorUserId: duy.userId, readers: 'author', fact: 'Chỉ Duy xem' });
    await insertMemberFact(database, { workspaceId, memberUserId: hungUserId, authorUserId: duy.userId, readers: 'admins', fact: 'Các quản lý xem' });
    const lan = await insertAdminLan();

    const output = await runTool('forget_all_member_facts', { member_id: hungMembershipId }, lan);

    expect(JSON.parse(output)).toEqual({ ok: true, member: 'Hùng', facts: [] });
    expect(await readMemberFacts(database, hungUserId)).toBe('- Chỉ Duy xem');
  });

  it('refuses a member who adds a fact about another member and stores nothing', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const hung: AccessScope = { workspaceId, userId: hungUserId, role: 'member' };

    const output = await runTool('add_member_fact', { member_id: await findMembershipId(lanUserId), fact: PLATE_FACT, readers: SHARED }, hung);

    expect(output).toBe('{"ok":false,"error":"Không có quyền."}');
    expect(await readMemberFacts(database, lanUserId)).toBeNull();
  });

  it('leaves the private memory of the admin empty when it adds a fact about a member', async () => {
    const output = await runTool('add_member_fact', { member_id: hungMembershipId, fact: PLATE_FACT, readers: SHARED });

    expect(JSON.parse(output).ok).toBe(true);
    expect(await readMemberFacts(database, hungUserId)).toBe(`- ${PLATE_FACT}`);
    expect(await readPrivateMemory(database, duy.userId)).toBeNull();
  });

  async function insertAdminLan(): Promise<AccessScope> {
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan-admin', displayName: 'Lan', role: 'admin' });
    return { workspaceId, userId, role: 'admin' };
  }

  function shared(fact: string): object {
    return { fact, readers: SHARED };
  }

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
