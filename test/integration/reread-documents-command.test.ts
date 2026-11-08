import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRereadDocumentsCommand } from '../../src/bootstrap/reread-documents.ts';
import type { ReaderService } from '../../src/services/reading/reader-service.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertSentMessage } from './sent-message-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

const READER_SETTINGS = { READER_PROVIDER: 'openai-compatible', READER_API_KEY: 'key' };
const PHOTO_STORAGE_SETTINGS = {
  PHOTO_STORAGE: 's3',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'photos',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('the reread-documents command', () => {
  let database: TemporaryDatabase;
  let photoStorage: FakePhotoStorage;

  beforeEach(async () => {
    database = await createMigratedDatabase();
    photoStorage = new FakePhotoStorage();
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

  it('stores a document for each message that has none', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const firstMessageId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const secondMessageId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T11:00:00+07:00');
    const reader = new FakeReader();
    reader.answerWith(makeReading([makeItem({ document_kind: 'hóa đơn' })]));

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 2 messages. Stored 2 documents. No document in 0. Test photos: 0. Failed 0.']);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 2 }]);
    expect(await database.query('SELECT message_id FROM document_sources ORDER BY message_id')).toEqual(
      [firstMessageId, secondMessageId].sort().map((messageId) => ({ message_id: messageId })),
    );
    expect(await database.query('SELECT message_id, outcome FROM document_reads ORDER BY message_id')).toEqual(
      [firstMessageId, secondMessageId].sort().map((messageId) => ({ message_id: messageId, outcome: 'saved' })),
    );
  });

  it('reads a photo that was never saved too', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const reader = new FakeReader();
    reader.answerWith(makeReading([makeItem({ document_kind: 'hóa đơn' })]));

    await runReread(workspaceId, reader);

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT message_id FROM document_sources')).toEqual([{ message_id: messageId }]);
  });

  it('records no document for a message with no work data', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');

    const { exitCode, lines } = await runReread(workspaceId, new FakeReader());

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 1 messages. Stored 0 documents. No document in 1. Test photos: 0. Failed 0.']);
    expect(await database.query('SELECT message_id, outcome FROM document_reads')).toEqual([
      { message_id: messageId, outcome: 'no_document' },
    ]);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 0 }]);
  });

  async function seedWorkspace(): Promise<{ workspaceId: string; userId: string }> {
    const workspaceId = await insertWorkspace(database, 'Xe tải Duy Khương');
    const userId = await insertMember(database, { workspaceId, externalUserId: 'zalo-1', displayName: 'Duy' });
    return { workspaceId, userId };
  }

  async function insertSavedPhoto(workspaceId: string, userId: string, sentAt: string): Promise<string> {
    const messageId = await insertUnsavedPhoto(workspaceId, userId, sentAt, 'accepted');
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', messageId, createdAt: new Date(sentAt) });
    return messageId;
  }

  async function insertUnsavedPhoto(
    workspaceId: string,
    userId: string,
    sentAt: string,
    submissionStatus: 'accepted' | 'unresolved' = 'unresolved',
  ): Promise<string> {
    const imageKey = `${workspaceId}/${randomUUID()}.jpg`;
    await photoStorage.put(imageKey, { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    return insertSentMessage(database, { workspaceId, userId, sentAt, imageKey, submissionStatus });
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
      { DATABASE_URL: database.runtimeUrl, ...READER_SETTINGS, ...PHOTO_STORAGE_SETTINGS },
      { log: (line) => lines.push(line), buildReader: () => reader, buildPhotoStorage: () => photoStorage },
    );
    return { exitCode, lines };
  }
});
