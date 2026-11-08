import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runRereadDocumentsCommand } from '../../src/bootstrap/reread-documents.ts';
import type { ReaderService } from '../../src/services/reading/reader-service.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createMigratedDatabase } from './migrated-database.ts';
import { insertDocumentWithSource } from './document-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertSentMessage, type NewSentMessage } from './sent-message-rows.ts';
import { literal } from './sql-literals.ts';
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

  it('gives the reader the explanation the member sent after the photo', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const photoId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00', 'accepted');
    await insertRecordRow(database, {
      workspaceId,
      userId,
      senderName: 'Duy',
      messageId: photoId,
      createdAt: new Date('2026-11-02T10:04:00+07:00'),
    });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:03:00+07:00', text: 'lốp xe 29C-123.45, 3.500.000đ' });
    const reader = new FakeReader();

    await runReread(workspaceId, reader);

    expect(reader.requests).toHaveLength(1);
    expect(reader.requests[0]?.text).toBe(
      'Các tin nhắn gần đây của người gửi, từ cũ đến mới:\n- lốp xe 29C-123.45, 3.500.000đ',
    );
  });

  it('gives the reader only the sender own texts from 10 minutes before the photo up to its first record', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const otherUserId = await insertMember(database, { workspaceId, externalUserId: 'zalo-2', displayName: 'Lan' });
    const photoId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00', 'accepted');
    await insertRecordRow(database, {
      workspaceId,
      userId,
      senderName: 'Duy',
      messageId: photoId,
      createdAt: new Date('2026-11-02T10:04:00+07:00'),
    });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T09:49:00+07:00', text: 'quá sớm 11 phút' });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T09:51:00+07:00', text: 'sớm 9 phút' });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:03:00+07:00', text: 'trước khi lưu' });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:05:00+07:00', text: 'sau khi lưu' });
    await insertSentMessage(database, { workspaceId, userId: otherUserId, sentAt: '2026-11-02T10:02:00+07:00', text: 'của người khác' });
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:01:00+07:00', text: 'chú thích ảnh', imageKey: 'other.jpg' });
    const reader = new FakeReader();

    await runReread(workspaceId, reader);

    expect(reader.requests[0]?.text).toBe('Các tin nhắn gần đây của người gửi, từ cũ đến mới:\n- sớm 9 phút\n- trước khi lưu');
  });

  it('gives the reader the latest 10 texts up to 10 minutes after a photo with no record', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    for (let count = 1; count <= 12; count += 1) {
      const sentAt = new Date(Date.parse('2026-11-02T10:00:00+07:00') + count * 30_000).toISOString();
      await insertSentMessage(database, { workspaceId, userId, sentAt, text: `tin ${String(count).padStart(2, '0')}` });
    }
    await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:11:00+07:00', text: 'tin muộn' });
    const reader = new FakeReader();

    await runReread(workspaceId, reader);

    const expectedTexts = ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((count) => `- tin ${count}`);
    expect(reader.requests[0]?.text).toBe(['Các tin nhắn gần đây của người gửi, từ cũ đến mới:', ...expectedTexts].join('\n'));
  });

  it('skips a photo whose inbound event live intake has not finished', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertSentMessage(database, {
      workspaceId,
      userId,
      sentAt: '2026-11-02T10:00:00+07:00',
      imageKey: `${workspaceId}/${randomUUID()}.jpg`,
      eventStatus: 'processing',
    });
    const reader = new FakeReader();

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 0 messages. Stored 0 documents. No document in 0. Test photos: 0. Failed 0.']);
    expect(reader.requests).toEqual([]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('reads a ChatGPT text with its created time as the sent time and no photo', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const [message] = await database.query<{ id: string }>(
      `INSERT INTO messages (workspace_id, user_id, author, source, text, submission_status, created_at)
       VALUES (${literal(workspaceId)}, ${literal(userId)}, 'user', 'mcp', 'đổ dầu 1.250.000đ', 'accepted', '2026-11-05T13:30:00+07:00')
       RETURNING id`,
    );
    await insertRecordRow(database, { workspaceId, userId, senderName: 'Duy', messageId: message?.id ?? '' });
    const reader = new FakeReader();

    await runReread(workspaceId, reader);

    expect(reader.requests).toHaveLength(1);
    expect(reader.requests[0]?.text).toBe('đổ dầu 1.250.000đ');
    expect(reader.requests[0]?.image).toBeNull();
    expect(reader.requests[0]?.system).toContain('Hôm nay là 05/11/2026');
  });

  it('gives the reader the date the message was sent as today', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const imageKey = `${workspaceId}/${randomUUID()}.jpg`;
    await photoStorage.put(imageKey, { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    await insertSentMessage(database, {
      workspaceId,
      userId,
      imageKey,
      sentAt: '2026-11-05T13:30:00+07:00',
      createdAt: new Date('2026-11-06T09:00:00+07:00'),
    });
    const reader = new FakeReader();

    await runReread(workspaceId, reader);

    expect(reader.requests[0]?.system).toContain('Hôm nay là 05/11/2026');
  });

  it('removes the records of a test photo and never reads it', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const testPhotoId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const reader = new FakeReader();

    const { exitCode, lines } = await runReread(workspaceId, reader, { testPhotoIds: [testPhotoId] });

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 0 messages. Stored 0 documents. No document in 0. Test photos: 1. Failed 0.']);
    expect(await database.query('SELECT count(*)::int AS count FROM records')).toEqual([{ count: 0 }]);
    expect(await database.query('SELECT id FROM messages')).toEqual([{ id: testPhotoId }]);
    expect(await database.query('SELECT message_id, outcome FROM document_reads')).toEqual([
      { message_id: testPhotoId, outcome: 'test_data' },
    ]);
    expect(reader.requests).toEqual([]);
  });

  it('refuses a test photo id from another workspace and changes nothing', async () => {
    const workspaceA = await seedWorkspace();
    const workspaceB = await seedWorkspace();
    const otherMessageId = await insertSavedPhoto(workspaceB.workspaceId, workspaceB.userId, '2026-11-02T10:00:00+07:00');
    const reader = new FakeReader();

    const { exitCode, lines } = await runReread(workspaceA.workspaceId, reader, { testPhotoIds: [otherMessageId] });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([`Not a photo message in this workspace: ${otherMessageId}`]);
    expect(await database.query('SELECT count(*)::int AS count FROM records')).toEqual([{ count: 1 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('reads nothing on a second run', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T11:00:00+07:00');
    const reader = answerFirstCallWithAnItem();
    await runReread(workspaceId, reader);
    const callsAfterFirstRun = reader.requests.length;

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 0 messages. Stored 0 documents. No document in 0. Test photos: 0. Failed 0.']);
    expect(reader.requests).toHaveLength(callsAfterFirstRun);
  });

  it('reports a reader failure and goes on with the next message', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const firstMessageId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const secondMessageId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T11:00:00+07:00');
    let calls = 0;
    const reader = new FakeReader(() => {
      calls += 1;
      return calls === 1 ? { ok: false, reason: 'unavailable' } : { ok: true, json: makeReading([makeItem({ document_kind: 'hóa đơn' })]) };
    });

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      `Failed message ${firstMessageId}: reader_failed`,
      'Re-read 2 messages. Stored 1 documents. No document in 0. Test photos: 0. Failed 1.',
    ]);
    expect(await database.query('SELECT message_id FROM document_sources')).toEqual([{ message_id: secondMessageId }]);
    expect(await database.query('SELECT message_id FROM document_reads')).toEqual([{ message_id: secondMessageId }]);
  });

  it('fails a message whose reply fails validation as invalid_output', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const reader = new FakeReader();
    reader.answerWith({ items: 'not a list' });

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(1);
    expect(lines[0]).toBe(`Failed message ${messageId}: invalid_output`);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('fails a message with records that the reader now reads as empty', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');

    const { exitCode, lines } = await runReread(workspaceId, new FakeReader());

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      `Failed message ${messageId}: no_items`,
      'Re-read 1 messages. Stored 0 documents. No document in 0. Test photos: 0. Failed 1.',
    ]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('links a rejected duplicate photo to the document of the original and creates no second one', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertReadTicketRecord(workspaceId, userId);
    const documentId = await insertDocumentWithSource(database, {
      workspaceId,
      userId,
      issuerKey: 'congtytnhhchengloongbinhduongpaper',
      documentNumber: '20261105054',
      documentDate: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    const duplicateId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-06T10:00:00+07:00', 'duplicate');
    const reader = new FakeReader();
    reader.answerWith(makeReading([makeChengLoongTicket()]));

    const { exitCode } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 1 }]);
    expect(await database.query(`SELECT document_id FROM document_sources WHERE message_id = '${duplicateId}'`)).toEqual([
      { document_id: documentId },
    ]);
    expect(await database.query(`SELECT outcome FROM document_reads WHERE message_id = '${duplicateId}'`)).toEqual([
      { outcome: 'saved' },
    ]);
  });

  it('creates the document of a saved message whose own record equals the new reading', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00', 'accepted');
    await insertRecordRow(database, {
      workspaceId,
      userId,
      senderName: 'Duy',
      messageId,
      category: 'phiếu cân',
      documentNumber: '20261105054',
      occurredOn: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    const reader = new FakeReader();
    reader.answerWith(makeReading([makeChengLoongTicket()]));

    const { exitCode } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(await database.query('SELECT document_number FROM documents')).toEqual([{ document_number: '20261105054' }]);
    expect(await database.query('SELECT message_id FROM document_sources')).toEqual([{ message_id: messageId }]);
  });

  it('creates no document for a rejected duplicate photo that matches no document', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertReadTicketRecord(workspaceId, userId);
    const duplicateId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-06T10:00:00+07:00', 'duplicate');
    const reader = new FakeReader();
    reader.answerWith(makeReading([makeChengLoongTicket()]));

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(0);
    expect(lines).toEqual(['Re-read 1 messages. Stored 0 documents. No document in 1. Test photos: 0. Failed 0.']);
    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 0 }]);
    expect(await database.query(`SELECT outcome FROM document_reads WHERE message_id = '${duplicateId}'`)).toEqual([
      { outcome: 'no_document' },
    ]);
  });

  it('fails a photo that photo storage no longer holds and writes nothing', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertSentMessage(database, {
      workspaceId,
      userId,
      sentAt: '2026-11-02T10:00:00+07:00',
      imageKey: `${workspaceId}/${randomUUID()}.jpg`,
    });
    const reader = new FakeReader();

    const { exitCode, lines } = await runReread(workspaceId, reader);

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      `Failed message ${messageId}: photo_missing`,
      'Re-read 1 messages. Stored 0 documents. No document in 0. Test photos: 0. Failed 1.',
    ]);
    expect(reader.requests).toEqual([]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  async function insertReadTicketRecord(workspaceId: string, userId: string): Promise<void> {
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-01T09:00:00+07:00', 'accepted');
    await insertRecordRow(database, {
      workspaceId,
      userId,
      senderName: 'Duy',
      messageId,
      category: 'phiếu cân',
      documentNumber: '20261105054',
      occurredOn: '2026-11-05',
      vehiclePlate: '93C04588',
    });
    await database.query(
      `INSERT INTO document_reads (workspace_id, message_id, outcome) VALUES (${literal(workspaceId)}, ${literal(messageId)}, 'saved')`,
    );
  }

  function answerFirstCallWithAnItem(): FakeReader {
    const noWorkData = { has_work_data: false, needs_explanation: false, has_question: false, items: [] };
    let calls = 0;
    return new FakeReader(() => {
      calls += 1;
      return { ok: true, json: calls === 1 ? makeReading([makeItem({ document_kind: 'hóa đơn' })]) : noWorkData };
    });
  }

  it('refuses a test photo id that is not a photo message in a dry run too', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertSavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const textMessageId = await insertSentMessage(database, { workspaceId, userId, sentAt: '2026-11-02T10:01:00+07:00', text: 'xin chào' });

    const { exitCode, lines } = await runReread(workspaceId, new FakeReader(), { apply: false, testPhotoIds: [textMessageId] });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([`Not a photo message in this workspace: ${textMessageId}`]);
  });

  it('stops before any change when the photo storage settings are missing', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');

    const { exitCode, lines } = await runWithEnvironment([workspaceId, '--apply'], READER_SETTINGS);

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      'Missing photo storage settings: PHOTO_STORAGE, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    ]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('stops before any change when the reader settings are missing', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');

    const { exitCode, lines } = await runWithEnvironment([workspaceId, '--apply'], PHOTO_STORAGE_SETTINGS);

    expect(exitCode).toBe(1);
    expect(lines).toEqual(['Missing reader settings: READER_PROVIDER, READER_API_KEY']);
    expect(await database.query('SELECT count(*)::int AS count FROM document_reads')).toEqual([{ count: 0 }]);
  });

  it('commits the document step and the read record together or neither', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    const messageId = await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');
    const readerThatLosesTheRace: ReaderService = {
      read: async () => {
        await database.query(
          `INSERT INTO document_reads (workspace_id, message_id, outcome) VALUES (${literal(workspaceId)}, ${literal(messageId)}, 'no_document')`,
        );
        return { ok: true, json: makeReading([makeItem({ document_kind: 'hóa đơn', details: [{ label: 'Hàng', value: 'giấy' }] })]) };
      },
    };

    await expect(runReread(workspaceId, readerThatLosesTheRace)).rejects.toThrow();

    expect(await database.query('SELECT count(*)::int AS count FROM documents')).toEqual([{ count: 0 }]);
    expect(await database.query('SELECT count(*)::int AS count FROM document_lines')).toEqual([{ count: 0 }]);
  });

  it('needs no reader and no photo storage settings for a dry run', async () => {
    const { workspaceId, userId } = await seedWorkspace();
    await insertUnsavedPhoto(workspaceId, userId, '2026-11-02T10:00:00+07:00');

    const { exitCode, lines } = await runWithEnvironment([workspaceId], {});

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      'Messages to re-read: 1. Test photos: 0, with 0 records to remove. Nothing changed. Run again with --apply.',
    ]);
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
    submissionStatus: NewSentMessage['submissionStatus'] = 'unresolved',
  ): Promise<string> {
    const imageKey = `${workspaceId}/${randomUUID()}.jpg`;
    await photoStorage.put(imageKey, { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    return insertSentMessage(database, { workspaceId, userId, sentAt, imageKey, submissionStatus });
  }

  async function runWithEnvironment(
    args: string[],
    settings: Record<string, string>,
  ): Promise<{ exitCode: number; lines: string[] }> {
    const lines: string[] = [];
    const exitCode = await runRereadDocumentsCommand(args, { DATABASE_URL: database.runtimeUrl, ...settings }, { log: (line) => lines.push(line) });
    return { exitCode, lines };
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

function makeChengLoongTicket() {
  return makeItem({
    category: 'phiếu cân',
    amount_vnd: null,
    occurred_on: '2026-11-05',
    document_number: '20261105054',
    document_kind: 'phiếu cân xe',
    vehicle_plate: '93C04588',
    parties: [{ role: 'issuer', type: 'company', printed_name: 'Công ty TNHH Cheng Loong Bình Dương Paper', known_name: null }],
  });
}
