import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupOldPhotos, type CleanupDependencies } from '../../src/app/intake/cleanup-old-photos.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertChatMessage } from './message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMembership, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-15T10:00:00Z');

describe('cleanupOldPhotos', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Test WS');
    const [user] = await database.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
    if (!user) throw new Error('user not inserted');
    userId = user.id;
    await insertMembership(database, { workspaceId, userId, displayName: 'Tester' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('deletes a photo older than the retention window and marks the row', async () => {
    const photoStorage = new FakePhotoStorage();
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'bot',
      text: null,
      imageKey: 'ws/a.jpg',
      createdAt: daysBeforeNow(200),
    });

    const result = await runCleanup({ photoStorage, retentionDays: 180, batchSize: 10 });

    expect(photoStorage.deletedKeys).toEqual(['ws/a.jpg']);
    expect(await fetchDeletedAt(messageId)).not.toBeNull();
    expect(result).toEqual({ deleted: 1, failed: 0 });
  });

  it('leaves a photo within the retention window alone', async () => {
    const photoStorage = new FakePhotoStorage();
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'bot',
      text: null,
      imageKey: 'ws/b.jpg',
      createdAt: daysBeforeNow(30),
    });

    const result = await runCleanup({ photoStorage, retentionDays: 180, batchSize: 10 });

    expect(photoStorage.deletedKeys).toHaveLength(0);
    expect(await fetchDeletedAt(messageId)).toBeNull();
    expect(result).toEqual({ deleted: 0, failed: 0 });
  });

  it('ignores a message already marked as deleted', async () => {
    const photoStorage = new FakePhotoStorage();
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'bot',
      text: null,
      imageKey: 'ws/c.jpg',
      createdAt: daysBeforeNow(300),
    });
    await database.query(`UPDATE messages SET image_deleted_at = now() - interval '10 days' WHERE id = '${messageId}'`);

    const result = await runCleanup({ photoStorage, retentionDays: 180, batchSize: 10 });

    expect(photoStorage.deletedKeys).toHaveLength(0);
    expect(result).toEqual({ deleted: 0, failed: 0 });
  });

  it('honours the batch size and leaves remaining rows eligible', async () => {
    const photoStorage = new FakePhotoStorage();
    const ids = await Promise.all([
      insertChatMessage(database, { workspaceId, userId, author: 'bot', text: null, imageKey: 'ws/x1.jpg', createdAt: daysBeforeNow(400) }),
      insertChatMessage(database, { workspaceId, userId, author: 'bot', text: null, imageKey: 'ws/x2.jpg', createdAt: daysBeforeNow(300) }),
      insertChatMessage(database, { workspaceId, userId, author: 'bot', text: null, imageKey: 'ws/x3.jpg', createdAt: daysBeforeNow(200) }),
    ]);

    const result = await runCleanup({ photoStorage, retentionDays: 180, batchSize: 2 });

    expect(photoStorage.deletedKeys).toHaveLength(2);
    expect(result).toEqual({ deleted: 2, failed: 0 });
    const deletedAts = await Promise.all(ids.map(fetchDeletedAt));
    const markedCount = deletedAts.filter((t) => t !== null).length;
    const skippedCount = deletedAts.filter((t) => t === null).length;
    expect(markedCount).toBe(2);
    expect(skippedCount).toBe(1);
  });

  it('leaves a row eligible after a delete failure, then cleans it up on the next run', async () => {
    const failingStorage = new FakePhotoStorage();
    failingStorage.isDeleteFailing = true;
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'bot',
      text: null,
      imageKey: 'ws/fail.jpg',
      createdAt: daysBeforeNow(200),
    });

    const failResult = await runCleanup({ photoStorage: failingStorage, retentionDays: 180, batchSize: 10 });

    expect(await fetchDeletedAt(messageId)).toBeNull();
    expect(failResult).toEqual({ deleted: 0, failed: 1 });

    const workingStorage = new FakePhotoStorage();
    const retryResult = await runCleanup({ photoStorage: workingStorage, retentionDays: 180, batchSize: 10 });

    expect(await fetchDeletedAt(messageId)).not.toBeNull();
    expect(retryResult).toEqual({ deleted: 1, failed: 0 });
  });

  function daysBeforeNow(days: number): Date {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  }

  async function fetchDeletedAt(messageId: string): Promise<Date | null> {
    const [row] = await database.query<{ image_deleted_at: Date | null }>(
      `SELECT image_deleted_at FROM messages WHERE id = '${messageId}'`,
    );
    return row?.image_deleted_at ?? null;
  }

  function runCleanup(overrides: Partial<CleanupDependencies> = {}): Promise<{ deleted: number; failed: number }> {
    return cleanupOldPhotos(
      {
        database: pool,
        photoStorage: overrides.photoStorage ?? new FakePhotoStorage(),
        retentionDays: overrides.retentionDays ?? 180,
        batchSize: overrides.batchSize ?? 50,
      },
      NOW,
    );
  }
});
