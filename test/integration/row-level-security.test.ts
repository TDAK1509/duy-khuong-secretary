import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertChatMessage } from './message-rows.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('row-level security for the runtime role', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await database.drop();
  });

  it('hides records when no scope is set', async () => {
    for (let index = 0; index < 3; index += 1) {
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' });
    }
    const session = await database.openRuntimeSession();

    const { rows } = await session.query('SELECT id FROM records');

    expect(rows).toHaveLength(0);
  });

  it('hides messages when no scope is set', async () => {
    for (let index = 0; index < 4; index += 1) {
      await insertChatMessage(database, { workspaceId, userId: hungUserId, author: 'user', text: 'tin', createdAt: new Date() });
    }
    const session = await database.openRuntimeSession();

    const { rows } = await session.query('SELECT id FROM messages');

    expect(rows).toHaveLength(0);
  });

  it('hides reply photos when no scope is set', async () => {
    const photoId = await insertChatMessage(database, { workspaceId, userId: hungUserId, author: 'user', text: null, imageKey: 'a.jpg', createdAt: new Date() });
    for (let index = 0; index < 2; index += 1) {
      const replyId = await insertChatMessage(database, { workspaceId, userId: hungUserId, author: 'bot', text: 'ảnh', createdAt: new Date() });
      await database.query(
        `INSERT INTO reply_photos (reply_message_id, source_message_id, workspace_id) VALUES ('${replyId}', '${photoId}', '${workspaceId}')`,
      );
    }
    const session = await database.openRuntimeSession();

    const { rows } = await session.query('SELECT reply_message_id FROM reply_photos');

    expect(rows).toHaveLength(0);
  });
});
