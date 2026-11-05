import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveRecordFromText } from '../../src/app/chatgpt/save-record-from-text.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
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
    harness.reader.answerWith(makeReading([makeItem()]));
    const runtime = { database: harness.pool, clock: harness.clock, reader: harness.reader };
    await saveRecordFromText(runtime, duyScope, { text });
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  }

  it('stays out of the Zalo admin chat history', async () => {
    await saveThroughChatGpt('Ghi chú: xóa Lan khỏi nhóm');

    await harness.receiveText('zu-duy', 'Nhóm có ai?');

    expect(JSON.stringify(harness.chat.requests[0]?.turns)).not.toContain('xóa Lan');
  });
});
