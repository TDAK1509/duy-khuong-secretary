import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  ASK_LATER_TEXT,
  DUPLICATE_TEXT,
  STILL_UNCLEAR_TEXT,
  UNRESOLVED_TEXT,
  UPLOAD_ONLY_TEXT,
} from '../../src/app/intake/intake-texts.ts';
import { CHANGE_REFUSED_NOTICE } from '../../src/app/admin-chat/chat-texts.ts';
import { replyWithText, replyWithToolCalls } from '../fakes/fake-chat-service.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { ReaderRequest, ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertRecordRow } from './record-rows.ts';
import { timestamp } from './sql-literals.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const PHOTO_B_URL = 'https://z.test/b.jpg';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const HOURS_IN_MS = 60 * 60 * 1000;
const TIRE_EXPLANATION = 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ';
const TIRE_SAVED_REPLY = 'Đã lưu: Bảo dưỡng: lốp, xe 29C12345, 3.500.000đ.';
const QUESTION_ABOUT_TIRE = 'Lốp này đã lắp cho xe nào chưa?';
const QUESTION = makeReading([], { has_work_data: false, has_question: true });
const WEAK = makeReading([], { has_work_data: false });
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);
const TIRE_AND_QUESTION = { ...TIRE_ITEM, has_question: true };
const FIRST_LINE = 'Lốp mới thay';
const SECOND_LINE = 'xe 29C-123.45, giá 3.500.000đ';
const MINUTE_IN_MS = 60 * 1000;

describe('asking what an unclear photo is for', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertMember(database, {
      workspaceId,
      externalUserId: 'zu-duy',
      displayName: 'Duy',
      role: 'admin',
      lastInboundAt: DUY_LAST_WROTE_AT,
    });
    harness.channel.attachments.set(PHOTO_A_URL, { ok: true, bytes: makeJpeg(1000) });
    harness.channel.attachments.set(PHOTO_B_URL, { ok: true, bytes: makeJpeg(2000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('asks about the first unclear photo and quotes it', async () => {
    readerReturns(UNCLEAR);

    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-hung')).toEqual([{ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' }]);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'needs_explanation', hasBotReply: true });
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('says it will ask later about a second unclear photo, which waits its turn', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);

    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-hung')).toEqual([
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' },
      { text: ASK_LATER_TEXT, quoteMessageId: 'zmsg-2' },
    ]);
    expect(await readPhoto('zmsg-2')).toEqual({ status: 'needs_explanation', hasBotReply: false });
  });

  it('reads the next text together with the photo that was asked about', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);

    const request = harness.reader.requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`Lời giải thích của người gửi cho ảnh này:\n${TIRE_EXPLANATION}`);
  });

  it('saves the record on the photo and quotes the photo in the reply to a good answer', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    const recordedOn = await harness.database.query<{ event: string }>(
      `SELECT event.external_event_id AS event FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
    expect(recordedOn).toEqual([{ event: 'zmsg-1' }]);
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'accepted', hasBotReply: true });
  });

  it('asks about the next waiting photo after a good answer', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).slice(-2)).toEqual([
      { text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' },
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-2' },
    ]);
    expect(await readPhoto('zmsg-2')).toEqual({ status: 'needs_explanation', hasBotReply: true });
  });

  it('asks once more after a first weak answer', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);

    await harness.receiveText('zu-hung', 'cái này');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_AGAIN_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'asked_again', hasBotReply: true });
  });

  it('ends the wait after a second weak answer', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);
    await harness.receiveText('zu-hung', 'cái này');

    await harness.receiveText('zu-hung', 'không biết');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: STILL_UNCLEAR_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'unresolved', hasBotReply: true });
  });

  it('does not count a reader outage on an answer as a try', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);
    await harness.receiveText('zu-hung', 'cái này');

    await harness.receiveText('zu-hung', 'Lốp dự phòng để trong kho', { reader: makeTimingOutReader() });
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)?.text).toBe(UNRESOLVED_TEXT);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'asked_again', hasBotReply: true });
  });

  it('ends every wait of the member when the question is older than 24 hours', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    await harness.sendAllQueuedTexts();
    await backdateQuestion('zmsg-1', 25);
    const textsBefore = (await readTextsTo('zu-hung')).length;
    readerReturns(WEAK);

    await harness.receiveText('zu-hung', 'ok');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).slice(textsBefore)).toEqual([
      { text: UPLOAD_ONLY_TEXT, quoteMessageId: undefined },
    ]);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'unresolved', hasBotReply: true });
    expect(await readPhoto('zmsg-2')).toEqual({ status: 'unresolved', hasBotReply: false });
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('counts the 24 hours of a waiting photo from the moment it is asked', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    readerReturns(WEAK);
    await harness.receiveText('zu-hung', 'cái này');
    await harness.receiveText('zu-hung', 'không biết');
    await backdatePhoto('zmsg-2', 30);
    await backdateQuestion('zmsg-2', 2);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);

    const recordedOn = await harness.database.query<{ event: string }>(
      `SELECT event.external_event_id AS event FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
    expect(recordedOn).toEqual([{ event: 'zmsg-2' }]);
  });

  it('does not answer a photo of another member', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);

    await harness.receiveText('zu-lan', TIRE_EXPLANATION);

    expect(await readPhoto('zmsg-1')).toEqual({ status: 'needs_explanation', hasBotReply: true });
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('asks an admin to explain an unclear photo with no caption, as it asks a member', async () => {
    readerReturns(UNCLEAR);

    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-duy')).toEqual([{ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' }]);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'needs_explanation', hasBotReply: true });
    expect(harness.chat.requests).toEqual([]);
  });

  it('asks an admin to explain an unclear photo with a caption when he sent no earlier text', async () => {
    readerReturns(UNCLEAR);
    await insertInboundEvent(harness.database, {
      externalUserId: 'zu-duy',
      kind: 'images',
      imageUrls: [PHOTO_A_URL],
      externalEventId: 'zmsg-1',
      caption: 'Lốp này của xe nào?',
    });

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-duy')).toEqual([{ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' }]);
  });

  it('saves the record on the photo and quotes the photo when an admin explains it', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-duy', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect((await readTextsTo('zu-duy')).at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'accepted', hasBotReply: true });
    expect(harness.chat.requests).toEqual([]);
  });

  it('sends the photo and the question of an admin to the chat and accepts the photo', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(QUESTION);
    harness.chat.replyWith('Lốp này chưa lắp cho xe nào.');

    await harness.receiveText('zu-duy', QUESTION_ABOUT_TIRE);
    await harness.sendAllQueuedTexts();

    const lastTurn = harness.chat.requests.at(-1)?.turns.at(-1);
    expect(lastTurn).toMatchObject({ role: 'user', text: QUESTION_ABOUT_TIRE });
    expect(lastTurn?.role === 'user' ? lastTurn.image?.bytes : null).toEqual(makeJpeg(1000));
    expect((await readTextsTo('zu-duy')).at(-1)?.text).toBe('Lốp này chưa lắp cho xe nào.');
    expect(await readPhoto('zmsg-1')).toMatchObject({ status: 'accepted' });
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await readImageKeyOf(QUESTION_ABOUT_TIRE)).toBe(await readImageKeyOfEvent('zmsg-1'));
  });

  it('asks an admin about the next waiting photo after the chat answers a question', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-duy', 'zmsg-2', PHOTO_B_URL);
    readerReturns(QUESTION);
    harness.chat.replyWith('Lốp này chưa lắp cho xe nào.');

    await harness.receiveText('zu-duy', QUESTION_ABOUT_TIRE);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-duy')).toEqual([
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' },
      { text: ASK_LATER_TEXT, quoteMessageId: 'zmsg-2' },
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-2' },
      { text: 'Lốp này chưa lắp cho xe nào.', quoteMessageId: undefined },
    ]);
  });

  it('asks an admin once more after a first weak answer', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);

    await harness.receiveText('zu-duy', 'cái này');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-duy')).at(-1)).toEqual({ text: ASK_AGAIN_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'asked_again', hasBotReply: true });
  });

  it('answers an admin question once when it is processed again after the chat answer was published', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(QUESTION);
    harness.chat.replyWith('Lốp này chưa lắp cho xe nào.');
    await insertInboundEvent(harness.database, { externalUserId: 'zu-duy', text: QUESTION_ABOUT_TIRE });
    await harness.runInbound({ beforeFinish: crashBeforeFinishing });
    harness.clock.advanceBy(31_000);

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(harness.chat.requests).toHaveLength(1);
    expect((await readTextsTo('zu-duy')).filter((sent) => sent.text === 'Lốp này chưa lắp cho xe nào.')).toHaveLength(1);
  });

  it('keeps the photo for the chat when an admin question is processed again before the chat answered', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(QUESTION);
    const inviteCall = { id: 'call_1', name: 'create_invite', argumentsJson: JSON.stringify({ display_name: 'An', role: 'member' }) };
    harness.chat.follow((_request, callNumber) => {
      if (callNumber === 1) throw new Error('the chat failed');
      return callNumber === 2 ? replyWithToolCalls(inviteCall) : replyWithText('Lốp này chưa lắp cho xe nào.');
    });
    await insertInboundEvent(harness.database, { externalUserId: 'zu-duy', text: QUESTION_ABOUT_TIRE });
    await harness.runInbound();
    harness.clock.advanceBy(31_000);

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    const retriedTurn = harness.chat.requests[1]?.turns.at(-1);
    expect(retriedTurn?.role === 'user' ? retriedTurn.image?.bytes : null).toEqual(makeJpeg(1000));
    expect(await harness.database.query('SELECT 1 FROM workspace_invites')).toEqual([]);
    expect(await readTextsTo('zu-duy')).toContainEqual({
      text: `Lốp này chưa lắp cho xe nào.\n\n${CHANGE_REFUSED_NOTICE}`,
      quoteMessageId: undefined,
    });
    expect((await readTextsTo('zu-duy')).filter((sent) => sent.text.includes('Lốp này chưa lắp'))).toHaveLength(1);
  });

  it('saves the records on the photo and gives the chat the saved records when an admin explains and asks', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_AND_QUESTION);
    harness.chat.replyWith('Đã lưu lốp cho xe 29C-123.45.');

    await harness.receiveText('zu-duy', `${TIRE_EXPLANATION}. Lốp này đã lắp chưa?`);
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    const sent = await readTextsTo('zu-duy');
    expect(sent.at(-2)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(sent.at(-1)).toEqual({ text: 'Đã lưu lốp cho xe 29C-123.45.', quoteMessageId: undefined });
    const lastTurn = harness.chat.requests.at(-1)?.turns.at(-1);
    expect(lastTurn).toMatchObject({
      role: 'user',
      text: expect.stringContaining('Hệ thống đã lưu:\n- Bảo dưỡng: lốp, xe 29C12345 · 3.500.000đ'),
    });
    expect(harness.chat.requests).toHaveLength(1);
  });

  it('tells an admin that only photos and work data are accepted when his photo has no work data', async () => {
    readerReturns(WEAK);

    await sendPhoto('zu-duy', 'zmsg-1', PHOTO_A_URL);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-duy')).toEqual([{ text: UPLOAD_ONLY_TEXT, quoteMessageId: 'zmsg-1' }]);
  });

  it('saves once and asks about the next photo once when the answer is processed again after a crash', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    await harness.sendAllQueuedTexts();
    const textsBefore = (await readTextsTo('zu-hung')).length;
    readerReturns(TIRE_ITEM);
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', text: TIRE_EXPLANATION });
    await harness.runInbound({
      beforeFinish: async () => {
        throw new Error('the worker crashed before finishing');
      },
    });
    harness.clock.advanceBy(31_000);

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect((await readTextsTo('zu-hung')).slice(textsBefore)).toEqual([
      { text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' },
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-2' },
    ]);
  });

  it('asks about a new unclear photo at once when the earlier question is older than 24 hours', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await backdateQuestion('zmsg-1', 25);

    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-2' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'unresolved', hasBotReply: true });
    expect(await readPhoto('zmsg-2')).toEqual({ status: 'needs_explanation', hasBotReply: true });
  });

  it('says it will ask later once when the event of the waiting photo is processed again after a crash', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [PHOTO_B_URL], externalEventId: 'zmsg-2' });
    await harness.runInbound({
      beforeFinish: async () => {
        throw new Error('the worker crashed before finishing');
      },
    });
    harness.clock.advanceBy(31_000);

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).filter((sent) => sent.text === ASK_LATER_TEXT)).toHaveLength(1);
  });

  it('sends the replies about the photos of a two-photo event back as their photos', async () => {
    readerReturns(UNCLEAR);
    await insertInboundEvent(harness.database, {
      externalUserId: 'zu-hung',
      kind: 'images',
      imageUrls: [PHOTO_A_URL, PHOTO_B_URL],
      externalEventId: 'zmsg-1',
    });
    await harness.runInbound();
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    const photoReplies = harness.channel.sends.flatMap((sent) =>
      sent.kind === 'image' && sent.to === 'zu-hung' ? [{ photoSize: sent.photo.bytes.length, text: sent.text }] : [],
    );
    expect(photoReplies).toEqual([
      { photoSize: 1000, text: ASK_EXPLANATION_TEXT },
      { photoSize: 2000, text: ASK_LATER_TEXT },
      { photoSize: 1000, text: TIRE_SAVED_REPLY },
      { photoSize: 2000, text: ASK_EXPLANATION_TEXT },
    ]);
  });

  it('tells the admins about the first and the final reply to a photo, as of when the photo was sent', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    readerReturns(WEAK);
    await harness.receiveText('zu-hung', 'cái này');
    readerReturns(TIRE_ITEM);
    await insertInboundEvent(harness.database, {
      externalUserId: 'zu-hung',
      text: TIRE_EXPLANATION,
      sentAt: '2026-11-02T11:00:00+07:00',
    });
    await harness.runInbound();

    await harness.sendAllQueuedTexts();

    const notices = (await readTextsTo('zu-duy')).map(({ text }) => text);
    expect(notices).toEqual([
      formatNotice(ASK_EXPLANATION_TEXT),
      formatNotice(ASK_LATER_TEXT),
      formatNotice(TIRE_SAVED_REPLY),
    ]);
  });

  it('tells the member the paper is already saved when the answer repeats a saved record', async () => {
    await insertRecordRow(harness.database, {
      workspaceId: harness.workspaceId,
      userId: harness.hungUserId,
      senderName: 'Hùng',
      category: 'bảo dưỡng',
      maintenanceItem: 'lốp',
      vehiclePlate: '29C12345',
      amountVnd: 3500000,
    });
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: DUPLICATE_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'duplicate', hasBotReply: true });
    expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
  });

  it('does not call the reader or save anything when the stored photo is missing', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readerReturns(TIRE_ITEM);
    const readsBefore = harness.reader.requests.length;

    await harness.receiveText('zu-hung', TIRE_EXPLANATION, { photoStorage: new FakePhotoStorage() });
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toHaveLength(readsBefore);
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'needs_explanation', hasBotReply: true });
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: UNRESOLVED_TEXT, quoteMessageId: 'zmsg-1' });
  });

  it('reads the second answer again together with the earlier answer', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, 2);
    const reader = makeTwoLineReader();

    await harness.receiveText('zu-hung', SECOND_LINE, { reader });

    const request = reader.requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`Lời giải thích của người gửi cho ảnh này:\n${FIRST_LINE}\n${SECOND_LINE}`);
  });

  it('saves the records on the photo when the second reading with the earlier answer is good', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, 2);

    await harness.receiveText('zu-hung', SECOND_LINE, { reader: makeTwoLineReader() });
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
  });

  it('ends the wait when the second reading with the earlier answer is weak too', async () => {
    await askAgainAfterAnswer('zu-hung', 'cái này', 2);

    await harness.receiveText('zu-hung', 'không biết');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: STILL_UNCLEAR_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'unresolved', hasBotReply: true });
  });

  it('reads a first answer once', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    const reader = makeTwoLineReader();

    await harness.receiveText('zu-hung', 'cái này', { reader });

    expect(reader.requests).toHaveLength(1);
  });

  it('reads a second answer that is good alone once', async () => {
    await askAgainAfterAnswer('zu-hung', 'cái này', 2);
    const reader = makeReaderAnswering(() => TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION, { reader });

    expect(reader.requests).toHaveLength(1);
  });

  it('does not read an earlier answer sent more than 10 minutes before again', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, 11);
    const reader = makeTwoLineReader();

    await harness.receiveText('zu-hung', SECOND_LINE, { reader });

    expect(reader.requests).toHaveLength(1);
    expect(await readPhoto('zmsg-1')).toMatchObject({ status: 'unresolved' });
  });

  it('starts no second reading when the reader times out on the second answer', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, 2);
    const reader = makeTimingOutReader();

    await harness.receiveText('zu-hung', SECOND_LINE, { reader });

    expect(await readPhoto('zmsg-1')).toMatchObject({ status: 'asked_again' });
    expect(reader.requests).toHaveLength(1);
  });

  it('does not read a text sent before the question about the photo again', async () => {
    readerReturns(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    readerReturns(TIRE_ITEM);
    await sendTextSentMinutesAgo('zu-hung', TIRE_EXPLANATION, 5);
    readerReturns(WEAK);
    await sendTextSentMinutesAgo('zu-hung', 'cái này', 3);
    const reader = makeReaderAnswering(() => WEAK);

    await harness.receiveText('zu-hung', 'không biết', { reader });

    const texts = reader.requests.map(({ text }) => text);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => text?.includes(TIRE_EXPLANATION))).toEqual([]);
  });

  it('reads the second answer of an admin again with his earlier answer', async () => {
    await askAgainAfterAnswer('zu-duy', FIRST_LINE, 2);

    await harness.receiveText('zu-duy', SECOND_LINE, { reader: makeTwoLineReader() });
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect(harness.chat.requests).toEqual([]);
  });

  it('saves once when the second answer is processed again after a crash', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, 2);
    const reader = makeTwoLineReader();
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', text: SECOND_LINE });
    await harness.runInbound({ reader, beforeFinish: crashBeforeFinishing });
    harness.clock.advanceBy(31_000);

    await harness.runInbound({ reader });
    await harness.sendAllQueuedTexts();

    expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect((await readTextsTo('zu-hung')).filter((sent) => sent.text.startsWith('Đã lưu'))).toHaveLength(1);
  });

  it('does not read an earlier answer processed first but sent after the current answer again', async () => {
    await askAgainAfterAnswer('zu-hung', FIRST_LINE, -20);
    const reader = makeTwoLineReader();

    await harness.receiveText('zu-hung', SECOND_LINE, { reader });

    expect(reader.requests).toHaveLength(1);
    expect(await readPhoto('zmsg-1')).toMatchObject({ status: 'unresolved' });
  });

  async function askAgainAfterAnswer(externalUserId: string, answer: string, minutesAgo: number): Promise<void> {
    readerReturns(UNCLEAR);
    await sendPhoto(externalUserId, 'zmsg-1', PHOTO_A_URL);
    readerReturns(WEAK);
    await sendTextSentMinutesAgo(externalUserId, answer, minutesAgo);
  }

  async function sendTextSentMinutesAgo(externalUserId: string, text: string, minutesAgo: number): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, text, sentAt });
    await harness.runInbound();
  }

  async function readRecordedEvents(): Promise<{ event: string }[]> {
    return harness.database.query<{ event: string }>(
      `SELECT event.external_event_id AS event FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
  }

  async function readImageKeyOf(text: string): Promise<string | null> {
    const [row] = await harness.database.query<{ imageKey: string | null }>(
      `SELECT image_key AS "imageKey" FROM messages WHERE author = 'user' AND text = '${text}'`,
    );
    return row?.imageKey ?? null;
  }

  async function readImageKeyOfEvent(externalEventId: string): Promise<string | null> {
    const [row] = await harness.database.query<{ imageKey: string | null }>(
      `SELECT message.image_key AS "imageKey" FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
       WHERE event.external_event_id = '${externalEventId}'`,
    );
    return row?.imageKey ?? null;
  }

  function formatNotice(replyText: string): string {
    return `Hùng gửi ảnh vào nhóm "Xe tải Duy Khương" lúc 10:00 02/11/2026.\nTrợ lý đã trả lời Hùng:\n${replyText}`;
  }

  async function backdatePhoto(externalEventId: string, hoursAgo: number): Promise<void> {
    await harness.database.query(
      `UPDATE messages SET created_at = ${timestamp(new Date(NOW.getTime() - hoursAgo * HOURS_IN_MS))}
       WHERE id = (SELECT message.id FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
                   WHERE event.external_event_id = '${externalEventId}')`,
    );
  }

  async function backdateQuestion(externalEventId: string, hoursAgo: number): Promise<void> {
    await harness.database.query(
      `UPDATE messages SET created_at = ${timestamp(new Date(NOW.getTime() - hoursAgo * HOURS_IN_MS))}
       WHERE reply_to = (SELECT message.id FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
                         WHERE event.external_event_id = '${externalEventId}')`,
    );
  }

  function readerReturns(reading: unknown): void {
    harness.reader.answerWith(reading);
  }

  async function sendPhoto(externalUserId: string, externalEventId: string, imageUrl: string): Promise<void> {
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [imageUrl], externalEventId });
    await harness.runInbound();
  }

  async function readTextsTo(externalUserId: string): Promise<{ text: string; quoteMessageId: string | undefined }[]> {
    return harness.channel.texts
      .filter((sent) => sent.to.externalUserId === externalUserId)
      .map(({ text, quoteMessageId }) => ({ text, quoteMessageId }));
  }

  async function readPhoto(externalEventId: string): Promise<{ status: string; hasBotReply: boolean }> {
    const [photo] = await harness.database.query<{ status: string; hasBotReply: boolean }>(
      `SELECT message.submission_status AS status,
         EXISTS (SELECT 1 FROM messages reply WHERE reply.reply_to = message.id) AS "hasBotReply"
       FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
       WHERE event.external_event_id = '${externalEventId}'`,
    );
    if (!photo) throw new Error(`no message for event ${externalEventId}`);
    return photo;
  }
});

async function crashBeforeFinishing(): Promise<void> {
  throw new Error('the worker crashed before finishing');
}

function makeTwoLineReader(): FakeReader {
  return makeReaderAnswering(({ text }) => (text?.includes(FIRST_LINE) && text.includes(SECOND_LINE) ? TIRE_ITEM : WEAK));
}

function makeReaderAnswering(respond: (request: ReaderRequest) => unknown): FakeReader {
  return new FakeReader((request): ReaderResult => ({ ok: true, json: respond(request) }));
}

function makeTimingOutReader(): FakeReader {
  return new FakeReader(() => ({ ok: false, reason: 'timeout' }));
}
