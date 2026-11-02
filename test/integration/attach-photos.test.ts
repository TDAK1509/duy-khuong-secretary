import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

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
});
