import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDatabase } from './migrated-database.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the source of a message', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    userId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
  });

  afterEach(async () => {
    await database.drop();
  });

  it('refuses a Zalo user message without an inbound event', async () => {
    const insertMessage = database.query(
      `INSERT INTO messages (workspace_id, user_id, author, text, source) VALUES ('${workspaceId}', '${userId}', 'user', 'tin nhắn', 'zalo')`,
    );

    await expect(insertMessage).rejects.toThrow('messages_user_event_check');
  });
});
