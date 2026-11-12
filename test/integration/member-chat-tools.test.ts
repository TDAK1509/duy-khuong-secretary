import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessScope } from '../../src/app/access/access-scope.ts';
import { CreatedInvites } from '../../src/app/admin-chat/created-invites.ts';
import { CreatedTasks } from '../../src/app/admin-chat/created-tasks.ts';
import { NameReviewRequest } from '../../src/app/admin-chat/name-review-request.ts';
import { PhotoAttachments } from '../../src/app/admin-chat/photo-attachments.ts';
import { SourceCards } from '../../src/app/admin-chat/source-cards.ts';
import { AdminTextGuard } from '../../src/app/admin-chat/tools/admin-text-guard.ts';
import { runChatTool } from '../../src/app/admin-chat/tools/run-chat-tool.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const SEARCH_WITHOUT_FILTERS = {
  text: null,
  category: null,
  member: null,
  plate: null,
  added_from: null,
  added_to: null,
  occurred_from: null,
  occurred_to: null,
  cursor: null,
};
const NO_PERMISSION = '{"ok":false,"error":"Không có quyền."}';

describe('the tools of a member in the chat', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let lan: AccessScope;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    lan = { workspaceId, userId: lanUserId, role: 'member' };
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('refuses the member list', async () => {
    expect(await runTool('list_members', {})).toBe(NO_PERMISSION);
  });

  it('refuses to create an invite and creates none', async () => {
    const output = await runTool('create_invite', { display_name: 'Hùng', role: 'member' });

    expect(output).toBe(NO_PERMISSION);
    expect(await database.query('SELECT 1 FROM workspace_invites')).toEqual([]);
  });

  it('finds only the records of the member in a search without filters', async () => {
    await insertRecordRow(database, { workspaceId, userId: lan.userId, senderName: 'Lan', summary: 'dầu của Lan 1' });
    await insertRecordRow(database, { workspaceId, userId: lan.userId, senderName: 'Lan', summary: 'dầu của Lan 2' });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', summary: 'dầu của Hùng 1' });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', summary: 'dầu của Hùng 2' });

    const output = await runTool('search_records', SEARCH_WITHOUT_FILTERS);

    expect(JSON.parse(output).items.map((item: { summary: string }) => item.summary).sort()).toEqual(['dầu của Lan 1', 'dầu của Lan 2']);
  });

  it('refuses a search for another member by name', async () => {
    await insertRecordRow(database, { workspaceId, userId: lan.userId, senderName: 'Lan' });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });

    const output = await runTool('search_records', { ...SEARCH_WITHOUT_FILTERS, member: 'Hùng' });

    expect(output).toBe(NO_PERMISSION);
  });

  it('counts only the member in a count for a month', async () => {
    await insertRecordRow(database, { workspaceId, userId: lan.userId, senderName: 'Lan', amountVnd: 100000 });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', amountVnd: 700000 });
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', amountVnd: 800000 });

    const output = await runTool('count_records', { added_from: '2026-10-01', added_to: '2026-10-31' });

    expect(JSON.parse(output).members).toEqual([
      { member: 'Lan', total_count: 1, by_category: [{ category: 'đổ xăng dầu', count: 1, amount_vnd: 100000 }] },
    ]);
  });

  it('counts zero items and shows no other name for a member without records', async () => {
    await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });

    const output = await runTool('count_records', { added_from: '2026-10-01', added_to: '2026-10-31' });

    expect(JSON.parse(output).members).toEqual([{ member: 'Lan', total_count: 0, by_category: [] }]);
  });

  it('attaches no photo of another member', async () => {
    const hungRecordId = await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng', hasPhoto: true });

    const output = await runTool('attach_photos', { record_ids: [hungRecordId] });

    expect(output).toBe('{"attached":0}');
  });

  async function runTool(name: string, args: object, scope: AccessScope = lan): Promise<string> {
    const dependencies = {
      database: pool,
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
