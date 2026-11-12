import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import type { ChatResult, ToolCall } from '../../src/services/chat/chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

const SEARCH_EVERYTHING = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };

describe('which stored bot replies may hold text that the chatting user did not write', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  async function readAnswerFlags(): Promise<boolean[]> {
    const rows = await database.query<{ holds_other_text: boolean }>(
      `SELECT holds_other_text FROM messages WHERE author = 'bot' AND reply_kind = 'answer' ORDER BY created_at`,
    );
    return rows.map((row) => row.holds_other_text);
  }

  function callTool(name: string, args: unknown): ToolCall {
    return { id: `call_${name}`, name, argumentsJson: JSON.stringify(args) };
  }

  function followRounds(...rounds: ChatResult[]): void {
    harness.chat.follow((_request, callNumber) => rounds[callNumber - 1] ?? replyWithText('Hết.'));
  }

  describe('an answer of the admin chat', () => {
    it('is flagged after the model read data from members', async () => {
      followRounds(replyWithToolCalls(callTool('search_records', SEARCH_EVERYTHING)), replyWithText('Hùng gửi 1 phiếu.'));

      await harness.receiveText('zu-duy', 'Hùng gửi gì hôm nay?');

      expect(await readAnswerFlags()).toEqual([true]);
    });
  });
});
