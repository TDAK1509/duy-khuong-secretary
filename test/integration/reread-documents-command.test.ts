import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRereadDocumentsCommand } from '../../src/bootstrap/reread-documents.ts';
import type { ReaderService } from '../../src/services/reading/reader-service.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertSentMessage } from './sent-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('the reread-documents command', () => {
  let database: TemporaryDatabase;

  beforeEach(async () => {
    database = await createMigratedDatabase();
  });

  afterEach(async () => {
    await database.drop();
  });

  it('makes no reader call and changes nothing in a dry run', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    await insertSavedPhoto(workspaceId, userId, '2026-11-02T11:00:00+07:00');
    const reader = new FakeReader();

    const { exitCode, lines } = await runReread(workspaceId, reader, { apply: false });

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      'Messages to re-read: 2. Test photos: 0, with 0 records to remove. Nothing changed. Run again with --apply.',
    ]);
    expect(reader.requests).toEqual([]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 0 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  async function seedWorkspace(): Promise<{ workspaceId: string; userId: string }> {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zalo-1', displayName: 'Duy' });
    return { workspaceId, userId };
  }

  async function insertSavedPhoto(workspaceId: string, userId: string, sentAt: string): Promise<string> {
    const messageId = await insertSentMessage(database, { workspaceId, userId, sentAt, imageKey: `${workspaceId}/${sentAt}.jpg` });
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', messageId, createdAt: new Date(sentAt) });
    return messageId;
  }

  async function runReread(
    workspaceId: string,
    reader: ReaderService,
    { apply = true, testPhotoIds = [] }: { apply?: boolean; testPhotoIds?: string[] } = {},
  ): Promise<{ exitCode: number; lines: string[] }> {
    const lines: string[] = [];
    const testPhotoFlags = testPhotoIds.flatMap((id) => ['--test-photo', id]);
    const exitCode = await runRereadDocumentsCommand(
      [workspaceId, ...testPhotoFlags, ...(apply ? ['--apply'] : [])],
      { DATABASE_URL: database.runtimeUrl, READER_PROVIDER: 'openai-compatible', READER_API_KEY: 'key' },
      { log: (line) => lines.push(line), buildReader: () => reader },
    );
    return { exitCode, lines };
  }
});
