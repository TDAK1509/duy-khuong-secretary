import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember } from './workspace-rows.ts';

describe('the chat finds the original message of a record', () => {
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

  function listSourcesThenReply(recordIds: string[], reply = 'Đây là nguồn.'): void {
    const call = { id: 'call_1', name: 'list_sources', argumentsJson: JSON.stringify({ record_ids: recordIds }) };
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(call) : replyWithText(reply)));
  }

  function readToolOutput(): string {
    const turns = harness.chat.requests[1]?.turns ?? [];
    const result = turns.find((turn) => turn.role === 'tool_result');
    if (result?.role !== 'tool_result') throw new Error('the chat model got no tool result');
    return result.output;
  }

  async function insertHungTextRecord(): Promise<string> {
    return insertRecordRow(database, {
      workspaceId,
      userId: harness.hungUserId,
      senderName: 'Hùng',
      messageText: 'Đổ dầu 500k xe 29C12345',
      event: { sentAt: '2026-11-12T08:15:00+07:00' },
    });
  }

  it('tells the model who sent a record and when', async () => {
    const recordId = await insertHungTextRecord();
    listSourcesThenReply([recordId]);

    await harness.receiveText('zu-duy', 'đổ dầu của Hùng hôm nay lấy từ đâu?');

    expect(readToolOutput()).toBe(
      `{"sources":[{"card":1,"record_ids":["${recordId}"],"sender":"Hùng","sent_at":"08:15 12/11/2026","kind":"text","paper_dates":[]}],"left_out":0}`,
    );
  });

  it('reads the send time from Zalo and not from the processing time', async () => {
    const recordId = await insertRecordRow(database, {
      workspaceId,
      userId: harness.hungUserId,
      senderName: 'Hùng',
      createdAt: new Date('2026-11-12T07:05:00+07:00'),
      event: { sentAt: '2026-11-12T07:00:00+07:00' },
    });
    listSourcesThenReply([recordId]);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    expect(readToolOutput()).toContain('"sent_at":"07:00 12/11/2026"');
  });

  describe('after the answer', () => {
    const HUNG_CARD = 'Nguồn 1: Hùng gửi tin nhắn lúc 08:15 ngày 12/11/2026.\nNguyên văn: "Đổ dầu 500k xe 29C12345"';

    it('sends the card as a text message', async () => {
      listSourcesThenReply([await insertHungTextRecord()]);

      await harness.receiveText('zu-duy', 'đổ dầu của Hùng hôm nay lấy từ đâu?');
      await harness.sendAllQueuedTexts();

      expect(harness.channel.sends).toEqual([
        { kind: 'text', to: 'zu-duy', text: 'Đây là nguồn.' },
        { kind: 'text', to: 'zu-duy', text: HUNG_CARD },
      ]);
    });

    it('stores the answer with the card and flags it as holding other text', async () => {
      listSourcesThenReply([await insertHungTextRecord()]);

      await harness.receiveText('zu-duy', 'đổ dầu của Hùng hôm nay lấy từ đâu?');

      expect(await database.query(`SELECT text, holds_other_text FROM messages WHERE reply_kind = 'answer'`)).toEqual([
        { text: `Đây là nguồn.\n\n${HUNG_CARD}`, holds_other_text: true },
      ]);
    });
  });
});
