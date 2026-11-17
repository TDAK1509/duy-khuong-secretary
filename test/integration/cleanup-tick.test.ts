import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runTick } from '../../src/app/ticker/run-tick.ts';
import { createPostgresPool, type PostgresPool } from '../../src/providers/database/postgres.ts';
import { FakeClock } from '../fakes/fake-clock.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertChatMessage } from './message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMembership, insertWorkspace } from './workspace-rows.ts';

const NOW = new Date('2026-11-15T10:00:00Z');
const RETENTION_DAYS = 180;
const BATCH_SIZE = 50;

describe('photo cleanup in the tick', () => {
  let database: TemporaryDatabase;
  let pool: PostgresPool;
  let workspaceId: string;
  let userId: string;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    pool = createPostgresPool(database.url);
    workspaceId = await insertWorkspace(database, 'Tick WS');
    const [user] = await database.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
    if (!user) throw new Error('user not inserted');
    userId = user.id;
    await insertMembership(database, { workspaceId, userId, displayName: 'TickTester' });
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
  });

  it('runs photo cleanup when photoCleanup is configured', async () => {
    const photoStorage = new FakePhotoStorage();
    const messageId = await insertChatMessage(database, {
      workspaceId,
      userId,
      author: 'bot',
      text: null,
      imageKey: 'tick/photo.jpg',
      createdAt: new Date(NOW.getTime() - 200 * 24 * 60 * 60 * 1000),
    });

    await runTick({
      renewal: null,
      scheduledRuns: null,
      photoCleanup: {
        database: pool,
        photoStorage,
        clock: new FakeClock(NOW),
        retentionDays: RETENTION_DAYS,
        batchSize: BATCH_SIZE,
      },
    });

    expect(photoStorage.deletedKeys).toEqual(['tick/photo.jpg']);
    const [row] = await database.query<{ image_deleted_at: Date | null }>(
      `SELECT image_deleted_at FROM messages WHERE id = '${messageId}'`,
    );
    expect(row?.image_deleted_at).not.toBeNull();
  });

  it('skips photo cleanup when photoCleanup is null', async () => {
    await expect(
      runTick({ renewal: null, scheduledRuns: null, photoCleanup: null }),
    ).resolves.toBeUndefined();
  });
});
