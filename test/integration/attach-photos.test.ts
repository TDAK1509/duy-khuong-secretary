import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

describe('an admin attaches the photos of records to the answer', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    answerQuestionOnly();
  });

  afterEach(async () => {
    await harness.close();
  });

  function answerQuestionOnly(): void {
    const reading = makeReading([], { has_work_data: false, has_question: true });
    const pair: readonly [FakeReader, FakeReader] = harness.readers.cheap;
    pair.forEach((reader) => reader.answerWith(reading));
  }

  function attachThenReply(recordIds: string[], reply = 'Đây là ảnh.'): void {
    const call = { id: 'call_1', name: 'attach_photos', argumentsJson: JSON.stringify({ record_ids: recordIds }) };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText(reply)));
  }

  function readToolOutput(): string {
    const turns = harness.chat.requests[1]?.turns ?? [];
    const result = turns.find((turn) => turn.role === 'tool_result');
    if (result?.role !== 'tool_result') throw new Error('the chat model got no tool result');
    return result.output;
  }

  async function insertPhotoRecord(): Promise<string> {
    return insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', hasPhoto: true });
  }

  it('attaches the photo of a driver\'s record', async () => {
    attachThenReply([await insertPhotoRecord()]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":1}');
  });

  it('links the attached photo to the bot answer', async () => {
    const recordId = await insertPhotoRecord();
    attachThenReply([recordId]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(
      await database.query(`
        SELECT reply.author AS reply_author, reply.text AS reply_text, source.user_id = '${harness.hungUserId}' AS from_hung
        FROM reply_photos
        JOIN messages reply ON reply.id = reply_photos.reply_message_id
        JOIN messages source ON source.id = reply_photos.source_message_id`),
    ).toEqual([{ reply_author: 'bot', reply_text: 'Đây là ảnh.', from_hung: true }]);
  });

  it('sends the photo as an image after the text answer', async () => {
    const photo = { bytes: makeJpeg(500), contentType: 'image/jpeg' } as const;
    await harness.photoStorage.put(`${workspaceId}/photo.jpg`, photo);
    attachThenReply([await insertPhotoRecord()]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');
    await harness.sendAllQueuedTexts();

    expect(harness.channel.sends).toEqual([
      { kind: 'text', to: 'zu-duy', text: 'Đây là ảnh.' },
      { kind: 'image', to: 'zu-duy', photo },
    ]);
  });

  it('skips a record of another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Xe tải V');
    const vyUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-vy', displayName: 'Vy' });
    const foreignRecordId = await insertRecordRow(database, {
      workspaceId: otherWorkspaceId,
      userId: vyUserId,
      senderName: 'Vy',
      hasPhoto: true,
    });
    attachThenReply([foreignRecordId]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":0}');
  });

  it('attaches at most four photos', async () => {
    const recordIds = [];
    for (let number = 1; number <= 6; number += 1) recordIds.push(await insertPhotoRecord());
    attachThenReply(recordIds);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":4}');
  });

  it('sends the photos in the order of the given ids', async () => {
    const insertKeyedRecord = (imageKey: string) =>
      insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', imageKey });
    const first = await insertKeyedRecord('w/first.jpg');
    await insertKeyedRecord('w/second.jpg');
    const third = await insertKeyedRecord('w/third.jpg');
    attachThenReply([third, first]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(await database.query(`SELECT photo_key FROM outbound_messages WHERE kind = 'image' ORDER BY seq`)).toEqual([
      { photo_key: 'w/third.jpg' },
      { photo_key: 'w/first.jpg' },
    ]);
  });

  it('skips a record without a photo', async () => {
    const textRecordId = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng' });
    attachThenReply([textRecordId]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":0}');
  });

  it('skips an id that is not a uuid', async () => {
    attachThenReply(['abc']);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":0}');
  });

  it('attaches one photo for two records of the same photo', async () => {
    const firstId = await insertPhotoRecord();
    const [{ message_id: messageId } = { message_id: '' }] = await database.query<{ message_id: string }>(
      `SELECT message_id FROM records WHERE id = '${firstId}'`,
    );
    const secondId = await insertRecordRow(database, {
      workspaceId,
      userId: harness.hungUserId,
      senderName: 'Hùng',
      messageId,
      itemIndex: 1,
    });
    attachThenReply([firstId, secondId]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(readToolOutput()).toBe('{"attached":1}');
  });

  it('carries the membership of the admin on the image for the send-time check', async () => {
    attachThenReply([await insertPhotoRecord()]);

    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(
      await database.query(`
        SELECT outbound.admin_membership_id = membership.id AS carries_membership
        FROM outbound_messages outbound, memberships membership
        WHERE outbound.kind = 'image' AND membership.display_name = 'Duy'`),
    ).toEqual([{ carries_membership: true }]);
  });

  it('offers the photo tool', async () => {
    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(harness.chat.requests[0]?.tools.map((tool) => tool.name)).toContain('attach_photos');
  });

  it('puts the photo line in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Cho tôi xem ảnh');

    expect(harness.chat.requests[0]?.system).toContain('gọi attach_photos với id các mục liên quan');
  });
});
