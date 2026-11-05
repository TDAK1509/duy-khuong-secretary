import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CODE_CHOICE_TEXT } from '../../src/app/intake/intake-texts.ts';
import type { ReaderResult } from '../../src/services/reading/reader-service.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';

const PHOTO_URL = 'https://z.test/a.jpg';
const TIRE_EXPLANATION = 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ';
const FIRST_CODE = '8936012345678';
const SECOND_CODE = '8936012845678';

describe('choosing the right code when the readers disagree only on the code', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('sends a member the quoted code-choice text, then one message per candidate', async () => {
    await sendPhoto('zu-hung', 'zmsg-1', TIRE_EXPLANATION, makeCodeSplitReaders());
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-hung')).toEqual([
      { text: CODE_CHOICE_TEXT, quoteMessageId: 'zmsg-1' },
      { text: FIRST_CODE, quoteMessageId: undefined },
      { text: SECOND_CODE, quoteMessageId: undefined },
    ]);
    expect(await readPhotoStatus('zmsg-1')).toBe('needs_explanation');
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  async function sendPhoto(externalUserId: string, externalEventId: string, caption: string | null, readers: FakeReaderSlots): Promise<void> {
    await insertInboundEvent(harness.database, { externalUserId, kind: 'images', imageUrls: [PHOTO_URL], externalEventId, caption });
    await harness.runInbound({ readers });
  }

  async function readTextsTo(externalUserId: string): Promise<{ text: string; quoteMessageId: string | undefined }[]> {
    return harness.channel.texts
      .filter((sent) => sent.to.externalUserId === externalUserId)
      .map(({ text, quoteMessageId }) => ({ text, quoteMessageId }));
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
});

function makeCodeSplitReaders(): FakeReaderSlots {
  return {
    cheap: [makeReaderOfCode('cheap-1', FIRST_CODE), makeReaderOfCode('cheap-2', SECOND_CODE)],
    strong: [makeReaderOfCode('strong-1', FIRST_CODE), makeReaderOfCode('strong-2', SECOND_CODE)],
  };
}

function makeReaderOfCode(label: string, code: string): FakeReader {
  return new FakeReader(label, (): ReaderResult => ({ ok: true, json: makeTireWithCode(code) }));
}

function makeTireWithCode(code: string): unknown {
  return makeReading([
    makeItem({
      category: 'bảo dưỡng',
      maintenance_item: 'lốp',
      vehicle_plate: '29C-123.45',
      amount_vnd: 3500000,
      occurred_on: null,
      identifiers: [code],
    }),
  ]);
}
