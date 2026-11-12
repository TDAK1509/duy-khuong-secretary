import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { scopeDatabase } from '../../src/app/db/scoped-database.ts';
import { findRecordSources } from '../../src/app/records/find-record-sources.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertNumberedDocument, insertSourceOfMessage } from './document-number-rows.ts';
import { insertRecordRow } from './record-rows.ts';
import type { TemporaryDatabase } from './temporary-database.ts';
import { insertMember, insertWorkspace } from './workspace-rows.ts';

type OutboundRow = {
  kind: string;
  body: string | null;
  quote_message_id: string | null;
  fallback_photo_key: string | null;
  photo_key: string | null;
  admin_membership_id: string | null;
};

describe('the chat finds the original message of a record', () => {
  let harness: IntakeHarness;
  let database: TemporaryDatabase;
  let workspaceId: string;
  let duyUserId: string;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    ({ database, workspaceId } = harness);
    duyUserId = await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
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
      `{"sources":[{"card":1,"record_ids":["${recordId}"],"sender":"Hùng","sent_at":"08:15 12/11/2026","kind":"text","paper_dates":[],"quoted":false}],"left_out":0}`,
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

  it('returns five sources in input order and counts one left out for six messages', async () => {
    const recordIds: string[] = [];
    for (const text of ['a', 'b', 'c', 'd', 'e', 'f']) {
      recordIds.push(await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', messageText: text }));
    }
    listSourcesThenReply(recordIds);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    const output = JSON.parse(readToolOutput()) as { sources: { record_ids: string[] }[]; left_out: number };
    expect(output.sources.map((source) => source.record_ids)).toEqual(recordIds.slice(0, 5).map((recordId) => [recordId]));
    expect(output.left_out).toBe(1);
  });

  it('keeps the name at the time of sending after the member is renamed', async () => {
    const recordId = await insertHungTextRecord();
    await database.query(`UPDATE memberships SET display_name = 'Hùng B' WHERE user_id = '${harness.hungUserId}'`);
    listSourcesThenReply([recordId]);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    expect(readToolOutput()).toContain('"sender":"Hùng"');
  });

  it('makes a change tool refuse in the same turn after a source was read', async () => {
    const recordId = await insertHungTextRecord();
    callToolsThenReply(
      [
        { name: 'list_sources', args: { record_ids: [recordId] } },
        { name: 'create_invite', args: { display_name: 'Lan', role: 'member' } },
      ],
      'Đây là nguồn.',
    );

    await harness.receiveText('zu-duy', 'Nguồn ở đâu? Mời Lan làm thành viên');

    const results = (harness.chat.requests[1]?.turns ?? []).flatMap((turn) => (turn.role === 'tool_result' ? [turn.output] : []));
    expect(results[1]).toBe(
      '{"ok":false,"error":"Chưa làm: tin nhắn đi kèm dữ liệu đọc từ ảnh hoặc lượt này đã đọc dữ liệu do thành viên gửi. Không gọi lại. Hệ thống tự hướng dẫn quản lý."}',
    );
    expect(await database.query(`SELECT 1 FROM workspace_invites`)).toEqual([]);
  });

  it('leaves out an id that is not a UUID without an error', async () => {
    listSourcesThenReply(['x']);

    await harness.receiveText('zu-duy', 'lấy từ đâu?');

    expect(readToolOutput()).toBe('{"sources":[],"left_out":1}');
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

    it('sends a card longer than the channel limit in parts and stores it in full', async () => {
      const longText = 'Đổ dầu '.repeat(Math.ceil(harness.channel.maxTextLength / 7) + 10).trim();
      const recordId = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', messageText: longText });
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-duy', 'lấy từ đâu?');
      await harness.sendAllQueuedTexts();

      const cardParts = harness.channel.sends.slice(1).map((sent) => (sent.kind === 'text' ? sent.text : ''));
      expect(cardParts.length).toBeGreaterThan(1);
      expect(cardParts.every((part) => Array.from(part).length <= harness.channel.maxTextLength)).toBe(true);
      const [stored] = await database.query<{ text: string }>(`SELECT text FROM messages WHERE reply_kind = 'answer'`);
      expect(stored?.text).toContain(`Nguyên văn: "${longText}"`);
    });

    it('shows the card in the history of the next turn', async () => {
      listSourcesThenReply([await insertHungTextRecord()]);
      await harness.receiveText('zu-duy', 'đổ dầu của Hùng hôm nay lấy từ đâu?');
      harness.chat.follow(() => replyWithText('Hết rồi.'));

      await harness.receiveText('zu-duy', 'Còn gì nữa không?');

      const lastRequest = harness.chat.requests.at(-1);
      const assistantTexts = (lastRequest?.turns ?? []).flatMap((turn) => (turn.role === 'assistant' ? [turn.text] : []));
      expect(assistantTexts).toEqual([`Đây là nguồn.\n\n${HUNG_CARD}`]);
    });

    it('merges the paper dates of two calls for records of one message into one card', async () => {
      const first = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', hasPhoto: true, occurredOn: '2026-10-29' });
      const messageId = await readMessageIdOf(first);
      const second = await insertRecordRow(database, { workspaceId, userId: harness.hungUserId, senderName: 'Hùng', messageId, itemIndex: 1, occurredOn: '2026-10-30' });
      const callOf = (recordId: string, id: string) => ({ id, name: 'list_sources', argumentsJson: JSON.stringify({ record_ids: [recordId] }) });
      harness.chat.follow((_request, callNumber) => {
        if (callNumber === 1) return replyWithToolCalls(callOf(first, 'call_1'));
        return callNumber === 2 ? replyWithToolCalls(callOf(second, 'call_2')) : replyWithText('Đây là nguồn.');
      });

      await harness.receiveText('zu-duy', 'lấy từ đâu?');
      await harness.sendAllQueuedTexts();

      expect(harness.channel.texts.map((sent) => sent.text)).toEqual([
        'Đây là nguồn.',
        'Nguồn 1: Hùng gửi ảnh lúc 10:00 ngày 02/11/2026.\nNgày trên giấy tờ: 29/10/2026, 30/10/2026.\nNguyên văn: "tin nhắn"',
      ]);
    });
  });

  describe('documents', () => {
    function listDocumentSourcesThenReply(documentIds: string[], recordIds: string[] = []): void {
      callToolsThenReply([{ name: 'list_sources', args: { record_ids: recordIds, document_ids: documentIds } }], 'Đây là nguồn.');
    }

    it('gives a document source with no record one source and one card', async () => {
      const documentId = await insertNumberedDocument(database, { workspaceId, userId: harness.hungUserId, documentNumber: '0001' });
      listDocumentSourcesThenReply([documentId]);

      await harness.receiveText('zu-duy', 'tổng này lấy từ đâu?');
      await harness.sendAllQueuedTexts();

      expect(JSON.parse(readToolOutput())).toMatchObject({ sources: [{ card: 1, record_ids: [], sender: 'Hùng', kind: 'photo', paper_dates: ['05/11/2026'] }], left_out: 0 });
      expect(harness.channel.texts.map((sent) => sent.text)).toEqual(['Đây là nguồn.', expect.stringContaining('Nguồn 1: Hùng gửi ảnh lúc')]);
    });

    it('gives one card to a message linked through a record and a document', async () => {
      const recordId = await insertHungTextRecord();
      const documentId = await insertNumberedDocument(database, { workspaceId, userId: harness.hungUserId, documentNumber: '0002' });
      await database.query(`DELETE FROM document_sources WHERE document_id = '${documentId}'`);
      await insertSourceOfMessage(database, { workspaceId, documentId, messageId: await readMessageIdOf(recordId) });
      listDocumentSourcesThenReply([documentId], [recordId]);

      await harness.receiveText('zu-duy', 'lấy từ đâu?');

      expect(JSON.parse(readToolOutput())).toMatchObject({ sources: [{ card: 1, record_ids: [recordId] }], left_out: 0 });
      expect(JSON.parse(readToolOutput()).sources).toHaveLength(1);
    });
  });

  describe('quotes in the conversation', () => {
    function readOutboundMessages(): Promise<OutboundRow[]> {
      return database.query<OutboundRow>(`SELECT kind, body, quote_message_id, fallback_photo_key, photo_key, admin_membership_id FROM outbound_messages ORDER BY seq`);
    }

    it('quotes the own text source of a member', async () => {
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        messageText: 'Đổ dầu 500k',
        event: { externalEventId: 'msg-1', sentAt: '2026-11-12T08:15:00+07:00' },
      });
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-hung', 'cái này lấy từ đâu?');

      expect(readToolOutput()).toContain('"quoted":true');
      expect(await readOutboundMessages()).toMatchObject([
        { kind: 'text', body: 'Đây là nguồn.', quote_message_id: null },
        { kind: 'text', body: expect.stringContaining('Nguồn 1: Bạn gửi tin nhắn'), quote_message_id: 'msg-1' },
      ]);
    });

    it('quotes the own single photo of a member with the photo as fallback and sends it only once', async () => {
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        hasPhoto: true,
        event: { kind: 'images', externalEventId: 'msg-1' },
      });
      callToolsThenReply(
        [
          { name: 'list_sources', args: { record_ids: [recordId] } },
          { name: 'attach_photos', args: { record_ids: [recordId] } },
        ],
        'Đây là nguồn.',
      );

      await harness.receiveText('zu-hung', 'ảnh này lấy từ đâu?');

      expect(await readOutboundMessages()).toMatchObject([
        { kind: 'text', body: 'Đây là nguồn.' },
        { kind: 'text', quote_message_id: 'msg-1', fallback_photo_key: `${workspaceId}/photo.jpg` },
      ]);
    });

    it('sends the own photo of a member from an album as the photo with the card text and no quote', async () => {
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        hasPhoto: true,
        event: { kind: 'images', imageUrls: ['https://z.test/1.jpg', 'https://z.test/2.jpg'], externalEventId: 'msg-1' },
      });
      callToolsThenReply(
        [
          { name: 'list_sources', args: { record_ids: [recordId] } },
          { name: 'attach_photos', args: { record_ids: [recordId] } },
        ],
        'Đây là nguồn.',
      );

      await harness.receiveText('zu-hung', 'ảnh này lấy từ đâu?');

      expect(await readOutboundMessages()).toMatchObject([
        { kind: 'text', body: 'Đây là nguồn.' },
        { kind: 'image', body: expect.stringContaining('Nguồn 1: Bạn gửi ảnh'), photo_key: `${workspaceId}/photo.jpg`, quote_message_id: null },
      ]);
    });

    it('gives an admin asking about a member source a plain card', async () => {
      const recordId = await insertHungTextRecord();
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-duy', 'lấy từ đâu?');

      expect(readToolOutput()).toContain('"quoted":false');
      expect(await readOutboundMessages()).toMatchObject([{ body: 'Đây là nguồn.' }, { body: expect.stringContaining('Nguồn 1: Hùng'), quote_message_id: null }]);
    });

    it('never quotes a record saved through ChatGPT', async () => {
      const recordId = await insertRecordRow(database, { workspaceId, userId: duyUserId, senderName: 'Duy', messageText: 'Đổ dầu 200k' });
      const messageId = await readMessageIdOf(recordId);
      await database.query(`UPDATE messages SET inbound_event_id = NULL, event_part = NULL, source = 'mcp' WHERE id = '${messageId}'`);
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-duy', 'lấy từ đâu?');

      expect(readToolOutput()).toContain('"quoted":false');
      expect(await readOutboundMessages()).toMatchObject([{ body: 'Đây là nguồn.' }, { body: expect.stringContaining('Nguồn 1: Bạn'), quote_message_id: null }]);
    });

    it('does not quote a source from another conversation', async () => {
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        event: { accountId: 'oa-other', externalEventId: 'msg-1' },
      });
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-hung', 'lấy từ đâu?');

      expect(readToolOutput()).toContain('"quoted":false');
      expect(await readOutboundMessages()).toMatchObject([{ body: 'Đây là nguồn.' }, { body: expect.stringContaining('Nguồn 1: Bạn'), quote_message_id: null }]);
    });

    it('sends the photo of a long album card once, with the first part only', async () => {
      const longCaption = 'Đổ dầu '.repeat(Math.ceil(harness.channel.maxTextLength / 7) + 10).trim();
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: harness.hungUserId,
        senderName: 'Hùng',
        hasPhoto: true,
        messageText: longCaption,
        event: { kind: 'images', imageUrls: ['https://z.test/1.jpg', 'https://z.test/2.jpg'], caption: longCaption },
      });
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-hung', 'ảnh này lấy từ đâu?');

      const cardRows = (await readOutboundMessages()).slice(1);
      expect(cardRows.length).toBeGreaterThan(1);
      expect(cardRows.map((row) => row.kind)).toEqual(['image', ...cardRows.slice(1).map(() => 'text')]);
      expect(cardRows.map((row) => row.quote_message_id)).toEqual(cardRows.map(() => null));
    });

    it('carries the admin membership id on the own quoted card of an admin', async () => {
      const recordId = await insertRecordRow(database, {
        workspaceId,
        userId: duyUserId,
        senderName: 'Duy',
        messageText: 'Đổ dầu 200k',
        event: { externalUserId: 'zu-duy', externalEventId: 'msg-1' },
      });
      listSourcesThenReply([recordId]);

      await harness.receiveText('zu-duy', 'lấy từ đâu?');

      const [membership] = await database.query<{ id: string }>(`SELECT id FROM memberships WHERE user_id = '${duyUserId}'`);
      const quotedCard = (await readOutboundMessages()).find((row) => row.quote_message_id === 'msg-1');
      expect(quotedCard?.admin_membership_id).toBe(membership?.id);
    });
  });
});
