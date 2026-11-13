import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import type { ChatResult, ToolCall } from '../../src/services/chat/chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { readMemberMemory } from './member-memory-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import { insertMember } from './workspace-rows.ts';

const PLATE_FACT = 'Lái xe biển số 93A-1234';
const SEARCH_EVERYTHING = { text: null, category: null, member: null, plate: null, added_from: null, added_to: null, cursor: null };

describe('an admin saves a fact about a member in the chat', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.clock.setTo(new Date('2026-10-31T10:00:00+07:00'));
    harness.reader.answerWith(makeReading([], { has_work_data: false, has_question: true }));
  });

  afterEach(async () => {
    await harness.close();
  });

  async function findHungMembershipId(): Promise<string> {
    const [row] = await harness.database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${harness.hungUserId}'`);
    if (!row) throw new Error('no membership for Hùng');
    return row.id;
  }

  function callTool(name: string, args: unknown): ToolCall {
    return { id: `call_${name}`, name, argumentsJson: JSON.stringify(args) };
  }

  function followRounds(...rounds: ChatResult[]): void {
    const requestsBefore = harness.chat.requests.length;
    harness.chat.follow((_request, callNumber) => {
      const round = rounds[callNumber - requestsBefore - 1];
      if (round === undefined) throw new Error(`no round ${callNumber}`);
      return round;
    });
  }

  it('refuses the fact in a turn that already read member data', async () => {
    await insertRecordRow(harness.database, { workspaceId: harness.workspaceId, userId: harness.hungUserId, senderName: 'Hùng', summary: 'Ghi chú' });
    const hungId = await findHungMembershipId();
    followRounds(
      replyWithToolCalls(callTool('search_records', SEARCH_EVERYTHING)),
      replyWithToolCalls(callTool('add_member_fact', { member_id: hungId, fact: PLATE_FACT })),
      replyWithText('Chưa lưu.'),
    );

    await harness.receiveText('zu-duy', 'Xe của Hùng biển số 93A-1234');
    await harness.sendQueuedTexts();

    expect(await readMemberMemory(harness.database, harness.hungUserId)).toBeNull();
  });
});
