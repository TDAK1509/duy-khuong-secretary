import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT } from '../../src/app/intake/intake-texts.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
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
    const reader = makeContextReader();

    await sendPhotoA('zu-hung', reader);

    const request = reader.requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_TEXT}`);
  });

  it('saves the records on the photo and asks nothing when the second reading is good', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);

    await sendPhotoA('zu-hung', makeContextReader());
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    const texts = await readTextsTo('zu-hung');
    expect(texts.at(-1)).toEqual({ text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' });
    expect(texts.map(({ text }) => text)).not.toContain(ASK_EXPLANATION_TEXT);
  });

  it('puts the caption last in the second reading', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const reader = makeContextReader();

    await sendPhotoA('zu-hung', reader, 'thay lốp');

    expect(reader.requests.at(-1)?.text).toBe(`${RECENT_MESSAGES_HEADER}, từ cũ đến mới:\n- ${PLATE_TEXT}\n- thay lốp`);
  });

  it('does not use a text sent more than 10 minutes before', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 11);
    const reader = makeContextReader();

    await sendPhotoA('zu-hung', reader);
    await harness.sendAllQueuedTexts();

    expect(reader.requests).toHaveLength(1);
    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' });
  });

  it('does not use a text before a saved message', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    await sendTextSentMinutesAgo('zu-hung', 'Đổ dầu 500.000đ xe 29C-123.45', 2, makeReaderAnswering(() => FUEL_ITEM));
    const reader = makeContextReader();

    await sendPhotoA('zu-hung', reader);

    expect(reader.requests).toHaveLength(1);
  });

  it('leaves the ask text as before when the second reading is weak', async () => {
    await sendTextSentMinutesAgo('zu-hung', 'cái này', 2);

    await sendPhotoA('zu-hung', makeReaderAnswering(() => UNCLEAR));
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhotoStatus('zmsg-1')).toBe('needs_explanation');
  });

  it('reads a clear photo once', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const reader = makeReaderAnswering(() => TIRE_ITEM);

    await sendPhotoA('zu-hung', reader);

    expect(reader.requests).toHaveLength(1);
  });

  it('saves an admin photo with no caption with his earlier text, without asking the chat', async () => {
    await sendTextSentMinutesAgo('zu-duy', PLATE_TEXT, 2);
    const chatRequestsBefore = harness.chat.requests.length;

    await sendPhotoA('zu-duy', makeContextReader());
    await harness.sendAllQueuedTexts();

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
    expect(harness.chat.requests).toHaveLength(chatRequestsBefore);
  });

  it('reads an unclear photo of an admin with a caption again with his earlier text and saves it', async () => {
    await sendTextSentMinutesAgo('zu-duy', PLATE_TEXT, 2);

    await sendPhotoA('zu-duy', makeContextReader(), 'Lốp này của xe nào?');

    expect(await readRecordedEvents()).toEqual([{ event: 'zmsg-1' }]);
  });

  it('saves once when the photo is processed again after a crash', async () => {
    await sendTextSentMinutesAgo('zu-hung', PLATE_TEXT, 2);
    const reader = makeContextReader();
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [PHOTO_A_URL], externalEventId: 'zmsg-1' });
    await harness.runInbound({ reader, beforeFinish: crashBeforeFinishing });
    harness.clock.advanceBy(31_000);

    await harness.runInbound({ reader });
    await harness.sendAllQueuedTexts();

    expect(await harness.database.query('SELECT 1 FROM records')).toHaveLength(1);
    expect((await readTextsTo('zu-hung')).filter((sent) => sent.text.startsWith('Đã lưu'))).toHaveLength(1);
  });

  async function sendTextSentMinutesAgo(
    externalUserId: string,
    text: string,
    minutesAgo: number,
    reader: FakeReader = makeContextReader(),
  ): Promise<void> {
    const sentAt = new Date(NOW.getTime() - minutesAgo * MINUTE_IN_MS).toISOString();
    await insertInboundEvent(harness.database, { externalUserId, text, sentAt });
    await harness.runInbound({ reader });
  }

  async function sendPhotoA(externalUserId: string, reader: FakeReader, caption: string | null = null): Promise<void> {
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [PHOTO_A_URL], externalEventId: 'zmsg-1', caption });
    await harness.runInbound({ reader });
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

function makeContextReader(): FakeReader {
  return makeReaderAnswering(({ text }) => (text?.startsWith(RECENT_MESSAGES_HEADER) ? TIRE_ITEM : UNCLEAR));
}

function makeReaderAnswering(respond: (request: ReaderRequest) => unknown): FakeReader {
  return new FakeReader((request): ReaderResult => ({ ok: true, json: respond(request) }));
}

async function crashBeforeFinishing(): Promise<void> {
  throw new Error('the worker crashed before finishing');
}
