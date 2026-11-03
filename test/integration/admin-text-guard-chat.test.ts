import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeReader } from '../fakes/fake-reader.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import type { ChatResult, ToolCall } from '../../src/services/chat/chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

describe('the text an admin wrote is the only text that changes anything', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
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

  async function findMembershipId(displayName: string): Promise<string> {
    const [row] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE display_name = '${displayName}'`);
    if (!row) throw new Error(`no member named ${displayName}`);
    return row.id;
  }

  async function countMembers(displayName: string): Promise<number> {
    return (await database.query(`SELECT 1 FROM memberships WHERE display_name = '${displayName}'`)).length;
  }

  function sentTexts(): string[][] {
    return harness.channel.texts.map((sent) => [sent.to.externalUserId, sent.text]);
  }

  function callTool(name: string, args: unknown, id = `call_${name}`): ToolCall {
    return { id, name, argumentsJson: JSON.stringify(args) };
  }

  function followRounds(...rounds: (ChatResult | (() => ChatResult))[]): void {
    harness.chat.follow((_request, callNumber) => {
      const round = rounds[callNumber - 1];
      if (round === undefined) throw new Error(`no round ${callNumber}`);
      return typeof round === 'function' ? round() : round;
    });
  }

  it('still removes a person who is asked for by name in a text message', async () => {
    const hungId = await findMembershipId('Hùng');
    followRounds(
      replyWithToolCalls(callTool('list_members', {})),
      replyWithToolCalls(callTool('remove_member', { member_id: hungId })),
      replyWithText('Đã xóa Hùng.'),
    );

    await harness.receiveText('zu-duy', 'Xóa Hùng khỏi nhóm');
    await harness.sendQueuedTexts();

    expect(await countMembers('Hùng')).toBe(0);
    expect(sentTexts()).toEqual([['zu-duy', 'Đã xóa Hùng.']]);
  });
});
