import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

describe('an admin asks the bot', () => {
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

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  it('gives an admin message without work data the answer of the chat model', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');
    await harness.sendQueuedTexts();

    expect(sentTexts()).toEqual([['zu-duy', 'Chào anh']]);
  });

  it('stores the answer as a bot reply to the question', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(
      await database.query(`
        SELECT reply.text, reply.reply_kind, reply.reply_to = original.id AS replies_to_question
        FROM messages reply JOIN messages original ON original.author = 'user'
        WHERE reply.author = 'bot'`),
    ).toEqual([{ text: 'Chào anh', reply_kind: 'answer', replies_to_question: true }]);
  });

  it('carries the membership of the admin on the answer for the send-time check', async () => {
    harness.chat.replyWith('Chào anh');

    await harness.receiveText('zu-duy', 'Chào bạn');

    expect(
      await database.query(`
        SELECT outbound.admin_membership_id = membership.id AS carries_membership
        FROM outbound_messages outbound, memberships membership
        WHERE outbound.body = 'Chào anh' AND membership.display_name = 'Duy'`),
    ).toEqual([{ carries_membership: true }]);
  });

  it('names the workspace and the admin in the system prompt', async () => {
    await harness.receiveText('zu-duy', 'Chào bạn');

    const system = harness.chat.requests[0]?.system;
    expect(system).toContain('nhóm "Xe tải Duy Khương"');
    expect(system).toContain('Bạn đang trò chuyện với Duy, vai trò: quản lý');
  });
});
