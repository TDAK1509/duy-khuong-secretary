import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT } from '../../src/app/intake/intake-texts.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import type { ReaderRequest, ReaderResult } from '../../src/services/reading/reader-service.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, NOW, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const MINUTE_IN_MS = 60 * 1000;
const PLATE_TEXT = 'xe 29C-123.45';
const TIRE_SAVED_REPLY = 'Đã lưu: Bảo dưỡng: lốp, xe 29C12345, 3.500.000đ.';
const RECENT_MESSAGES_HEADER = 'Các tin nhắn gần đây của người gửi';
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const FUEL_ITEM = makeReading([
  makeItem({ category: 'đổ xăng dầu', vehicle_plate: '29C-123.45', amount_vnd: 500000, occurred_on: null }),
]);
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);

describe('reading an unclear photo with the recent texts of the sender', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin', lastInboundAt: DUY_LAST_WROTE_AT });
    harness.channel.attachments.set(PHOTO_A_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('reads an unclear photo again with the earlier text of the sender', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const readers = makeContextReaders();

    await sendPhotoA('zu-hung', readers);

    const request = readers.cheap[0].requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_TEXT}`);
  });

  it('saves the records on the photo and asks nothing when the second reading is good', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);

    await sendPhotoA('zu-hung', makeContextReaders());
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    const texts = await readTextsTo('zu-hung');
    expect(texts.at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(texts.map(({ text }) => text)).not.toContain(ASK_EXPLANATION_TEXT);
  });

  it('puts the caption last in the second reading', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const readers = makeContextReaders();

    await sendPhotoA('zu-hung', readers, 'thay lốp');

    expect(readers.cheap[0].requests.at(-1)?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_TEXT}\n- thay lốp`);
  });

  it('does not use a text sent more than 10 minutes before', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 11);
    const readers = makeContextReaders();

    await sendPhotoA('zu-hung', readers);
    await harness.sendAllQueuedTexts();

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' });
  });

  it('does not use a text before a saved message', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    await sendTextSentMinutesAgo('zu-hung', 'Đổ dầu 500.000đ xe 29C-123.45', 2, makeReadersAnswering(() => FUEL_ITEM));
    const readers = makeContextReaders();

    await sendPhotoA('zu-hung', readers);

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('leaves the ask text as before when the second reading is weak', async () => {
    await sendTextSentMinutesAgo('zu-hung', 'cái này', 2);

    await sendPhotoA('zu-hung', makeReadersAnswering(() => UNCLEAR));
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhotoStatus('zmsg-1')).toBe('needs_explanation');
  });

  it('reads a clear photo once', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const readers = makeReadersAnswering(() => TIRE_ITEM);

    await sendPhotoA('zu-hung', readers);

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
  });

  it('saves an admin photo with no caption with his earlier text, without asking the chat', async () => {
    await sendTextSentMinutesAgo('zu-duy', PLATE_TEXT, 2);
    const chatRequestsBefore = harness.chat.requests.length;

    await sendPhotoA('zu-duy', makeContextReaders());
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect(harness.chat.requests).toHaveLength(chatRequestsBefore);
  });

  it('sends an admin photo that needs an explanation and has a caption to the chat without a second reading', async () => {
    await sendTextSentMinutesAgo('zu-duy', PLATE_TEXT, 2);
    harness.chat.replyWith('Ảnh này là lốp xe.');
    const readers = makeContextReaders();

    await sendPhotoA('zu-duy', readers, 'Lốp này của xe nào?');
    await harness.sendAllQueuedTexts();

    expect(readers.cheap.map((reader) => reader.requests.length)).toEqual([1, 1]);
    expect((await readTextsTo('zu-duy')).at(-1)?.text).toBe('Ảnh này là lốp xe.');
  });

  it('reads an admin photo with a caption again when the readers disagree', async () => {
    await sendTextSentMinutesAgo('zu-duy', PLATE_TEXT, 2);

    await sendPhotoA('zu-duy', makeDisagreeingReaders(), 'thay lốp');
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
  });

  async function sendTextSentMinutesAgo(
    externalUserId: string,
    text: string,
    minutesAgo: number,
    readers: FakeReaderSlots = makeContextReaders(),
  ): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, text, sentAt });
    await harness.runInbound({ readers });
  }

  async function sendPhotoA(externalUserId: string, readers: FakeReaderSlots, caption: string | null = null): Promise<void> {
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [PHOTO_A_URL], externalEventId: 'zmsg-1', caption });
    await harness.runInbound({ readers });
  }

  async function readRecordedEvents(): Promise<{ event: string }[]> {
    return harness.database.query<{ event: string }>(
      `SELECT event.external_event_id AS event FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
  }

  async function readPhotoStatus(externalEventId: string): Promise<string> {
    const [photo] = await harness.database.query<{ status: string }>(
      `SELECT message.submission_status AS status
       FROM messages message JOIN inbound_events event ON event.id = message.inbound_event_id
       WHERE event.external_event_id = '${externalEventId}'`,
    );
    if (!photo) throw new Error(`no message for event ${externalEventId}`);
    return photo.status;
  }

  async function readTextsTo(externalUserId: string): Promise<{ text: string; quoteMessageId: string | undefined }[]> {
    return harness.channel.texts
      .filter((sent) => sent.to.externalUserId === externalUserId)
      .map(({ text, quoteMessageId }) => ({ text, quoteMessageId }));
  }
});

function makeContextReaders(): FakeReaderSlots {
  return makeReadersAnswering(({ text }) => (text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : UNCLEAR));
}

function makeDisagreeingReaders(): FakeReaderSlots {
  const makeReader = (label: string, plate: string) =>
    new FakeReader(label, ({ text }): ReaderResult => ({ ok: true, json: text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : makeTireWithPlate(plate) }));
  return {
    cheap: [makeReader('cheap-1', '29C-111.11'), makeReader('cheap-2', '29C-222.22')],
    strong: [makeReader('strong-1', '29C-333.33'), makeReader('strong-2', '29C-444.44')],
  };
}

function makeTireWithPlate(plate: string): unknown {
  return makeReading([makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: plate, amount_vnd: 3500000, occurred_on: null })]);
}

function makeReadersAnswering(respond: (request: ReaderRequest) => unknown): FakeReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, (request): ReaderResult => ({ ok: true, json: respond(request) }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}
