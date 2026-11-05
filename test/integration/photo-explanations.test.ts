import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ASK_AGAIN_TEXT,
  ASK_EXPLANATION_TEXT,
  ASK_LATER_TEXT,
  STILL_UNCLEAR_TEXT,
  UNRESOLVED_TEXT,
} from '../../src/app/intake/intake-texts.ts';
import type { ReaderSlots } from '../../src/app/reading/decide-reading.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const PHOTO_B_URL = 'https://z.test/b.jpg';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const TIRE_EXPLANATION = 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ';
const TIRE_SAVED_REPLY = 'Đã lưu: Bảo dưỡng: lốp, xe 29C12345, 3.500.000đ.';
const WEAK = makeReading([], { has_work_data: false });
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });
const TIRE_ITEM = makeReading([
  makeItem({ category: 'bảo dưỡng', maintenance_item: 'lốp', vehicle_plate: '29C-123.45', amount_vnd: 3500000, occurred_on: null }),
]);

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
    readersReturn(UNCLEAR);

    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-hung')).toEqual([{ text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-1' }]);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'needs_explanation', hasBotReply: true });
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('says it will ask later about a second unclear photo, which waits its turn', async () => {
    readersReturn(UNCLEAR);
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
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readersReturn(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);

    const request = harness.readers.cheap[0].requests.at(-1);
    expect(request?.image?.bytes).toEqual(makeJpeg(1000));
    expect(request?.text).toBe(`Lời giải thích của người gửi cho ảnh này:\n${TIRE_EXPLANATION}`);
  });

  it('saves the record on the photo and quotes the photo in the reply to a good answer', async () => {
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readersReturn(TIRE_ITEM);

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
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    await sendPhoto('zu-hung', 'zmsg-2', PHOTO_B_URL);
    readersReturn(TIRE_ITEM);

    await harness.receiveText('zu-hung', TIRE_EXPLANATION);
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).slice(-2)).toEqual([
      { text: TIRE_SAVED_REPLY, quoteMessageId: 'zmsg-1' },
      { text: ASK_EXPLANATION_TEXT, quoteMessageId: 'zmsg-2' },
    ]);
    expect(await readPhoto('zmsg-2')).toEqual({ status: 'needs_explanation', hasBotReply: true });
  });

  it('asks once more after a first weak answer', async () => {
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readersReturn(WEAK);

    await harness.receiveText('zu-hung', 'cái này');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: ASK_AGAIN_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'asked_again', hasBotReply: true });
  });

  it('ends the wait after a second weak answer', async () => {
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readersReturn(WEAK);
    await harness.receiveText('zu-hung', 'cái này');

    await harness.receiveText('zu-hung', 'không biết');
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)).toEqual({ text: STILL_UNCLEAR_TEXT, quoteMessageId: 'zmsg-1' });
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'unresolved', hasBotReply: true });
  });

  it('does not count a reader outage on an answer as a try', async () => {
    readersReturn(UNCLEAR);
    await sendPhoto('zu-hung', 'zmsg-1', PHOTO_A_URL);
    readersReturn(WEAK);
    await harness.receiveText('zu-hung', 'cái này');

    await harness.receiveText('zu-hung', 'Lốp dự phòng để trong kho', { readers: makeTimingOutReaders() });
    await harness.sendAllQueuedTexts();

    expect((await readTextsTo('zu-hung')).at(-1)?.text).toBe(UNRESOLVED_TEXT);
    expect(await readPhoto('zmsg-1')).toEqual({ status: 'asked_again', hasBotReply: true });
  });

  function readersReturn(reading: unknown): void {
    for (const reader of harness.readers.cheap) reader.answerWith(reading);
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

function makeTimingOutReaders(): ReaderSlots {
  const makeReader = (label: string) => new FakeReader(label, () => ({ ok: false, reason: 'timeout' }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}
