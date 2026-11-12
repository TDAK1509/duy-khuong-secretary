import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';

describe('a member chats with the bot', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  it('gives a member greeting the answer of the chat model', async () => {
    harness.chat.replyWith('Chào bạn!');

    await harness.receiveText('zu-hung', 'Chào bạn');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-hung', 'Chào bạn!']]);
  });

  it('offers the member exactly the three member tools', async () => {
    await harness.receiveText('zu-hung', 'Chào bạn');

    expect(harness.chat.requests[0]?.tools.map((tool) => tool.name)).toEqual(['search_records', 'count_records', 'attach_photos']);
  });

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }
});
