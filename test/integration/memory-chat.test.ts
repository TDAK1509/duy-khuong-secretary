import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertUserMemory } from './user-memory-rows.ts';
import { insertMember } from './workspace-rows.ts';

describe('the memory of a user in the chat', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('puts the memory of the user in the system prompt as a JSON string', async () => {
    await insertUserMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: '- Tôi lái xe 29C-123.45' });

    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(harness.chat.requests[0]?.system).toContain('Bản ghi nhớ hiện tại, dưới dạng chuỗi JSON:\n"- Tôi lái xe 29C-123.45"');
  });

  it('puts the memory of another member nowhere in the prompt of a member', async () => {
    await insertUserMemory(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, markdown: '- Tôi lái xe 29C-123.45' });
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });

    await harness.receiveText('zu-lan', 'Chào bạn');

    const system = harness.chat.requests[0]?.system ?? '';
    expect(system).toContain('Bản ghi nhớ hiện tại, dưới dạng chuỗi JSON:\n""');
    expect(system).not.toContain('29C-123.45');
  });
});
