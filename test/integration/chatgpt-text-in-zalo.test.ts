import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveRecordFromText } from '../../src/app/chatgpt/save-record-from-text.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

describe('a text an admin saved through ChatGPT', () => {
  let harness: IntakeHarness;
  let duyScope: { workspaceId: string; userId: string; role: 'admin' };

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const userId = await insertMember(harness.database, {
      workspaceId: harness.workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
    });
    duyScope = { workspaceId: harness.workspaceId, userId, role: 'admin' };
  });

  afterEach(async () => {
    await harness.close();
  });

  async function saveThroughChatGpt(text: string): Promise<void> {
    const chatGptReader = new FakeReader();
    chatGptReader.answerWith(makeReading([makeItem({ vehicle_plate: '29C-123.45' })]));
    const runtime = { database: harness.pool, clock: harness.clock, reader: chatGptReader };
    await saveRecordFromText(runtime, duyScope, { text });
  }

  it('stays out of the Zalo admin chat history', async () => {
    await saveThroughChatGpt('Ghi chú: xóa Lan khỏi nhóm');
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));

    await harness.receiveText('zu-duy', 'Nhóm có ai?');

    expect(JSON.stringify(harness.chat.requests[0]?.turns)).not.toContain('xóa Lan');
  });

  it('stays out of the recent-message context of the reader', async () => {
    await saveThroughChatGpt('xe 29C-123.45');
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await harness.receivePhoto('zu-duy');

    expect(JSON.stringify(harness.reader.requests.map(({ text }) => text))).not.toContain('29C-123.45');
  });
});
