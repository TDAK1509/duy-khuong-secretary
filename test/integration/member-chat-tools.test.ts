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
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const NO_PERMISSION = '{"ok":false,"error":"Không có quyền."}';

describe('the tools of a member in the chat', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let lan: AccessScope;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    lan = { workspaceId, userId: lanUserId, role: 'member' };
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  async function runTool(name: string, args: object, scope: AccessScope = lan): Promise<string> {
    const dependencies = {
      database: pool,
      clock: new FakeClock(new Date('2026-11-02T14:05:00+07:00')),
      attachments: new PhotoAttachments(),
      created: new CreatedTasks(null),
      invites: new CreatedInvites(),
      nameReview: new NameReviewRequest(),
      guard: new AdminTextGuard(false),
    };
    return runChatTool(dependencies, scope, { id: 'call_1', name, argumentsJson: JSON.stringify(args) });
  }

  it('refuses the member list', async () => {
    expect(await runTool('list_members', {})).toBe(NO_PERMISSION);
  });

  it('refuses to create an invite and creates none', async () => {
    const output = await runTool('create_invite', { display_name: 'Hùng', role: 'member' });

    expect(output).toBe(NO_PERMISSION);
    expect(await database.query('SELECT 1 FROM workspace_invites')).toEqual([]);
  });
});
