import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, NOW, type IntakeHarness } from './intake-harness.ts';
import { literal } from './sql-literals.ts';
import { insertMember } from './workspace-rows.ts';

const MINUTE_IN_MS = 60 * 1000;
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây của người gửi';
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });

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
    await sendUnclearTextSentMinutesAgo('Lốp mới thay', 4);
    const reader = makeUnclearReader();

    await harness.receiveText('zu-duy', 'giá 3.500.000đ', { reader });

    expect(reader.requests.at(-1)?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- Lốp mới thay\n- giá 3.500.000đ`);
  });

  async function sendUnclearTextSentMinutesAgo(text: string, minutesAgo: number): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId: 'zu-duy', text, sentAt });
    await harness.runInbound({ reader: makeUnclearReader() });
  }
});

function makeUnclearReader(): FakeReader {
  return new FakeReader((): ReaderResult => ({ ok: true, usage: null, json: UNCLEAR }));
}
