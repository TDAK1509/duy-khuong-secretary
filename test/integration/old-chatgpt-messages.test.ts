import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { literal } from './sql-literals.ts';
import { insertMember } from './workspace-rows.ts';

describe('an old message that an admin saved through ChatGPT', () => {
  let harness: IntakeHarness;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    duyUserId = await insertMember(harness.database, {
      workspaceId: harness.workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await harness.close();
  });

  async function insertOldChatGptMessage(text: string): Promise<void> {
    await harness.database.query(
      `INSERT INTO messages (workspace_id, user_id, author, text, source, submission_status)
       VALUES (${literal(harness.workspaceId)}, ${literal(duyUserId)}, 'user', ${literal(text)}, 'mcp', 'accepted')`,
    );
  }

  it('stays out of the Zalo admin chat history', async () => {
    await insertOldChatGptMessage('Ghi chú: xóa Lan khỏi nhóm');
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));

    await harness.receiveText('zu-duy', 'Nhóm có ai?');

    expect(JSON.stringify(harness.chat.requests[0]?.turns)).not.toContain('xóa Lan');
  });

  it('stays out of the recent-message context of the reader', async () => {
    await insertOldChatGptMessage('xe 29C-123.45');
    harness.reader.answerWith(makeReading([], { has_work_data: false, needs_explanation: true }));
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });

    await harness.receivePhoto('zu-duy');

    expect(JSON.stringify(harness.reader.requests.map(({ text }) => text))).not.toContain('29C-123.45');
  });
});
