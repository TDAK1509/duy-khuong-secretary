import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASK_EXPLANATION_TEXT, ASK_LATER_TEXT } from '../../src/app/intake/intake-texts.ts';
import { makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_A_URL = 'https://z.test/a.jpg';
const PHOTO_B_URL = 'https://z.test/b.jpg';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });

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
