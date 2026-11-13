import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCallsUsing } from '../fakes/fake-chat-service.ts';
import { CHAT_ROUND_USAGE, PHOTO_READ_USAGE, TEXT_READ_USAGE } from '../fakes/sample-usage.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { listLlmCalls, readCreditBalance, setCreditBalance } from './llm-call-rows.ts';
import { insertMember } from './workspace-rows.ts';

describe('recording and charging the LLM calls of a workspace', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await setCreditBalance(harness.database, harness.workspaceId, 20000);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('records the photo read of a member and charges its credits', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.reader.answerWith(makeReading([makeItem()]), PHOTO_READ_USAGE);

    await harness.receivePhoto('zu-hung');

    expect(await listLlmCalls(harness.database, harness.workspaceId)).toEqual([
      {
        kind: 'photo_read',
        model: 'gpt-6.1-sol',
        input_tokens: 5700,
        cached_input_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: 1500,
        cost_usd: '0.026400000',
        credits: '39.600',
        balance_after: '19960.400',
      },
    ]);
    expect(await readCreditBalance(harness.database, harness.workspaceId)).toBe('19960.400');
  });

  it('records the text read of a member as a text read', async () => {
    harness.reader.answerWith(makeReading([makeItem()]), TEXT_READ_USAGE);

    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');

    expect(await listKinds()).toEqual(['text_read']);
  });

  it('records the read and the chat answer of an admin question', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }), TEXT_READ_USAGE);
    harness.chat.replyWith('Chào anh', CHAT_ROUND_USAGE);

    await harness.receiveText('zu-duy', 'Hôm nay ai gửi gì?');

    expect(await listKinds()).toEqual(['text_read', 'chat_answer']);
  });

  it('records each round of the tool loop as its own chat answer', async () => {
    await insertMember(harness.database, { workspaceId: harness.workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }), TEXT_READ_USAGE);
    const listMembers = { id: 'call_1', name: 'list_members', argumentsJson: '{}' };
    harness.chat.follow((_request, callNumber) =>
      callNumber === 1 ? replyWithToolCallsUsing(CHAT_ROUND_USAGE, listMembers) : replyWithText('Nhóm có 2 người.', CHAT_ROUND_USAGE),
    );

    await harness.receiveText('zu-duy', 'Nhóm có mấy người?');

    expect(await listKinds()).toEqual(['text_read', 'chat_answer', 'chat_answer']);
  });

  async function listKinds(): Promise<string[]> {
    return (await listLlmCalls(harness.database, harness.workspaceId)).map((call) => call.kind);
  }
});
