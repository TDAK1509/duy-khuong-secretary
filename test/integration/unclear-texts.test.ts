import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UPLOAD_ONLY_TEXT } from '../../src/app/intake/intake-texts.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import type { ReaderRequest, ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const MINUTE_IN_MS = 60 * 1000;
const TIRE_SAVED_REPLY = 'Đã lưu: Bảo dưỡng: lốp, xe 29C12345, 3.500.000đ.';
const FIRST_LINE = 'Lốp mới thay';
const SECOND_LINE = 'xe 29C-123.45, giá 3.500.000đ';
const PLATE_AND_AMOUNT = '29C-123.45, 3.500.000đ';
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây của người gửi';
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);
const FUEL_ITEM = makeReading([
  makeItem({ category: 'đổ xăng dầu', vehicle_plate: '29C-123.45', amount_vnd: 500000, occurred_on: null }),
]);
const TIRE_WITHOUT_PLATE = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: null, amount_vnd: 3500000, occurred_on: null }),
]);

describe('reading an unclear text with the recent messages of the sender', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-lan', displayName: 'Lan' });
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin' });
    harness.channel.attachments.set(PHOTO_A_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads an unclear text again with the latest unresolved photo', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);
    const readers = makeContextReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });

    const request = readers.cheap[0].requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_AND_AMOUNT}`);
  });

  it('saves the records on the photo and quotes the photo when the second reading is good', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers: makeContextReaders() });
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'accepted', hasBotReply: true });
  });

  it('does not use a photo sent more than 10 minutes before', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 11);
    const readers = makeContextReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });
    await harness.sendAllQueuedTexts();

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
    expect((await readTextsTo('zu-hung')).at(-1)?.text).toBe(UPLOAD_ONLY_TEXT);
  });

  it('does not use a photo whose readings agreed on no work data', async () => {
    await sendPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);
    const readers = makeContextReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('does not use the messages before a saved message', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);
    await sendTextSentMinutesAgo('zu-hung', 'Đổ dầu 500.000đ xe 29C-123.45', 2, makeReadersAnswering(() => FUEL_ITEM));
    const readers = makeContextReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('reads earlier unsaved texts without a photo and saves the records on the new text', async () => {
    const readers = makeReadersAnswering(({ text }) =>
      text?.includes(`- ${FIRST_LINE}`) && text.includes(`- ${SECOND_LINE}`) ? TIRE_ITEM : UNCLEAR,
    );
    await sendTextSentMinutesAgo('zu-hung', FIRST_LINE, 2, readers);

    await harness.receiveText('zu-hung', SECOND_LINE, { readers });

    expect(await readRecordedTexts()).toEqual([{ text: SECOND_LINE }]);
  });

  it('does not use the photo of another member', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-lan', 'zmsg-1', 2);
    const readers = makeContextReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('reads a clear text once', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);
    const readers = makeReadersAnswering(() => TIRE_ITEM);

    await harness.receiveText('zu-hung', `Lốp mới thay cho ${SECOND_LINE}`, { readers });

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
    expect(await readRecordedTexts()).toEqual([{ text: `Lốp mới thay cho ${SECOND_LINE}` }]);
  });

  it('starts no second reading when the readers time out', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-hung', 'zmsg-1', 2);
    const readers = makeTimingOutReaders();

    await harness.receiveText('zu-hung', PLATE_AND_AMOUNT, { readers });

    expect(readers.strong.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('saves an unclear text of an admin on his photo without asking the chat', async () => {
    await sendUnresolvedPhotoSentMinutesAgo('zu-duy', 'zmsg-1', 2);

    await harness.receiveText('zu-duy', PLATE_AND_AMOUNT, { readers: makeContextReaders() });
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect(harness.chat.requests).toEqual([]);
  });

  async function sendTextSentMinutesAgo(externalUserId: string, text: string, minutesAgo: number, readers: FakeReaderSlots): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, text, sentAt });
    await harness.runInbound({ readers });
  }

  async function sendUnresolvedPhotoSentMinutesAgo(externalUserId: string, externalEventId: string, minutesAgo: number): Promise<void> {
    for (const reader of harness.readers.cheap) reader.answerWith(TIRE_WITHOUT_PLATE);
    await sendPhotoSentMinutesAgo(externalUserId, externalEventId, minutesAgo);
  }

  async function sendPhotoSentMinutesAgo(externalUserId: string, externalEventId: string, minutesAgo: number): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [PHOTO_A_URL], externalEventId, sentAt });
    await harness.runInbound();
  }

  async function readRecordedEvents(): Promise<{ event: string }[]> {
    return harness.database.query<{ event: string }>(
      `SELECT event.external_event_id AS event FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
  }

  async function readRecordedTexts(): Promise<{ text: string }[]> {
    return harness.database.query<{ text: string }>(
      'SELECT message.text FROM records JOIN messages message ON message.id = records.message_id',
    );
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

function makeContextReaders(): FakeReaderSlots {
  return makeReadersAnswering(({ text }) => (text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : UNCLEAR));
}

function makeReadersAnswering(respond: (request: ReaderRequest) => unknown): FakeReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, (request): ReaderResult => ({ ok: true, json: respond(request) }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}

function makeTimingOutReaders(): FakeReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, (): ReaderResult => ({ ok: false, reason: 'timeout' }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}
