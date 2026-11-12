import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { findRecordSources } from '../../src/app/records/find-record-sources.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

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
    callToolsThenReply([{ name: 'list_sources', args: { record_ids: recordIds } }], reply);
  }

  function callToolsThenReply(tools: { name: string; args: object }[], reply: string): void {
    const calls = tools.map(({ name, args }, index) => ({ id: `call_${index + 1}`, name, argumentsJson: JSON.stringify(args) }));
    harness.chat.follow((_request, callNumber) => (callNumber === 1 ? replyWithToolCalls(...calls) : replyWithText(reply)));
  }

  function readToolOutput(): string {
    const turns = harness.chat.requests[1]?.turns ?? [];
    const result = turns.find((turn) => turn.role === 'tool_result');
    if (result?.role !== 'tool_result') throw new Error('the chat model got no tool result');
    return result.output;
  }

  async function readMessageIdOf(recordId: string): Promise<string> {
    const [row] = await database.query<{ message_id: string }>(`SELECT message_id FROM records WHERE id = '${recordId}'`);
    if (!row) throw new Error('record not found');
    return row.message_id;
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

  it('gives a member no source of another member and sends no card', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const lanRecordId = await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan', messageText: 'Đổ dầu 300k' });
    listSourcesThenReply([lanRecordId], 'Không tìm thấy dữ liệu phù hợp.');

    await harness.receiveText('zu-hung', 'đổ dầu của Lan lấy từ đâu?');
    await harness.sendAllQueuedTexts();

    expect(readToolOutput()).toBe('{"sources":[],"left_out":1}');
    expect(harness.channel.sends).toEqual([{ kind: 'text', to: 'zu-hung', text: 'Không tìm thấy dữ liệu phù hợp.' }]);
  });

  it('gives an admin no source from another workspace', async () => {
    const otherWorkspaceId = await insertWorkspace(database, 'Nhóm khác');
    const otherUserId = await insertMember(database, { workspaceId: otherWorkspaceId, externalUserId: 'zu-other', displayName: 'Khác' });
    const otherRecordId = await insertRecordRow(database, { workspaceId: otherWorkspaceId, userId: otherUserId, senderName: 'Khác' });
    listSourcesThenReply([otherRecordId]);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    expect(readToolOutput()).toBe('{"sources":[],"left_out":1}');
  });

  it('lets row-level security alone hide the source of another member', async () => {
    const lanUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    const lanRecordId = await insertRecordRow(database, { workspaceId, userId: lanUserId, senderName: 'Lan' });
    const hungDatabase = scopeDatabase(harness.pool, { workspaceId, ownerUserId: harness.hungUserId });

    const sources = await findRecordSources(hungDatabase, { workspaceId, userId: lanUserId, role: 'admin' }, [lanRecordId]);

    expect(sources).toEqual([]);
  });

  it('gives one source and one card to two records of one message', async () => {
    const first = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', hasPhoto: true });
    const messageId = await readMessageIdOf(first);
    const second = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', messageId, itemIndex: 1 });
    listSourcesThenReply([first, second]);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    expect(JSON.parse(readToolOutput())).toMatchObject({ sources: [{ card: 1, record_ids: [first, second] }], left_out: 0 });
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

    it('sends a photo card with its caption, followed by the photo', async () => {
      const photo = { bytes: makeJpeg(500), contentType: 'image/jpeg' } as const;
      await harness.photoStorage.put(`${workspaceId}/photo.jpg`, photo);
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        hasPhoto: true,
        messageText: 'phiếu cân',
        event: { kind: 'images', caption: 'phiếu cân', sentAt: '2026-11-12T08:15:00+07:00' },
      });
      callToolsThenReply(
        [
          { name: 'list_sources', args: { record_ids: [recordId] } },
          { name: 'attach_photos', args: { record_ids: [recordId] } },
        ],
        'Đây là nguồn.',
      );

      await harness.receiveText('zu-duy', 'phiếu cân lấy từ đâu?');
      await harness.sendAllQueuedTexts();

      expect(harness.channel.sends).toEqual([
        { kind: 'text', to: 'zu-duy', text: 'Đây là nguồn.' },
        { kind: 'text', to: 'zu-duy', text: 'Nguồn 1: Hùng gửi ảnh lúc 08:15 ngày 12/11/2026.\nNguyên văn: "phiếu cân"' },
        { kind: 'image', to: 'zu-duy', photo },
      ]);
    });
  });
});
