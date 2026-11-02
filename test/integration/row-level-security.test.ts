import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertChatMessage } from './message-rows.ts';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { runInTransaction } from '../../src/app/db/transaction.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('row-level security for the runtime role', () => {
  let database: TemporaryDatabase;
  let workspaceId: string;
  let hungUserId: string;
  let runtimePool: PostgresPool;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    runtimePool = createPostgresPool(database.runtimeUrl);
    workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    hungUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-hung', displayName: 'Hùng' });
  });

  afterEach(async () => {
    await runtimePool.end();
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

  it('shows a member scope only that member\'s messages, even with no filter', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const hungMessageIds = await insertMessages(hungUserId, 2);
    await insertMessages(lanUserId, 2);

    const rows = await selectIds('messages', { workspaceId, ownerUserId: hungUserId });

    expect(rows.sort()).toEqual(hungMessageIds.sort());
  });

  it('shows a member scope only that member\'s records, even with no filter', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const hungRecordIds = [
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' }),
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' }),
    ];
    await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan' });
    await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan' });

    const rows = await selectIds('records', { workspaceId, ownerUserId: hungUserId });

    expect(rows.sort()).toEqual(hungRecordIds.sort());
  });

  it('never shows a workspace scope another workspace\'s records', async () => {
    const wRecordIds = [
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' }),
      await insertRecordRow(database, { workspaceId, userId: hungUserId, senderName: 'Hùng' }),
    ];
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-v', displayName: 'V' });
    for (let index = 0; index < 3; index += 1) {
      await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: vUserId, senderName: 'V' });
    }

    const rows = await selectIds('records', { workspaceId });

    expect(rows.sort()).toEqual(wRecordIds.sort());
  });

  async function insertMessages(userId: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(await insertChatMessage(database, { workspaceId, userId, author: 'user', text: 'tin', createdAt: new Date() }));
    }
    return ids;
  }

  async function selectIds(table: string, scope: { workspaceId: string; ownerUserId?: string }): Promise<string[]> {
    const rows = await runInTransaction(scopeDatabase(runtimePool, scope), (transaction) =>
      transaction.query<{ id: string }>(`SELECT id FROM ${table}`),
    );
    return rows.map((row) => row.id);
  }
});
