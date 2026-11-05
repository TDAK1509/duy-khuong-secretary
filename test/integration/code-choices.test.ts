import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CODE_CHOICE_TEXT, UPLOAD_ONLY_TEXT } from '../../src/app/intake/intake-texts.ts';
import type { ReaderResult } from '../../src/services/reading/reader-service.ts';
import { FakeReader } from '../fakes/fake-reader.ts';
import { createFakeReaderSlots, type FakeReaderSlots } from '../fakes/fake-reader-slots.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, type IntakeHarness } from './intake-harness.ts';
import { insertMember } from './workspace-rows.ts';

const PHOTO_URL = 'https://z.test/a.jpg';
const TIRE_EXPLANATION = 'Lốp mới thay cho xe 29C-123.45, giá 3.500.000đ';
const FIRST_CODE = '8936012345678';
const SECOND_CODE = '8936012845678';
const DUY_LAST_WROTE_AT = new Date('2026-11-01T10:00:00+07:00');
const UNCLEAR = makeReading([], { has_work_data: false, needs_explanation: true });

describe('choosing the right code when the readers disagree only on the code', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    const { database, workspaceId } = harness;
    await insertMember(database, { workspaceId, externalUserId: 'zu-duy', displayName: 'Duy', role: 'admin', lastInboundAt: DUY_LAST_WROTE_AT });
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

  it('saves the record with the copied code, without a reading', async () => {
    await sendWaitingCodePhoto();
    const readers = makeCodeSplitReaders();

    await harness.receiveText('zu-hung', SECOND_CODE, { readers });
    await harness.sendAllQueuedTexts();

    expect(await readRecordedIdentifiers()).toEqual([{ event: 'zmsg-1', identifiers: [SECOND_CODE] }]);
    expect(await readTextsTo('zu-hung')).toEqual([
      { text: `Đã lưu: Bảo dưỡng: lốp, xe 29C12345, mã ${SECOND_CODE}, 3.500.000đ.`, quoteMessageId: 'zmsg-1' },
    ]);
    expect([...readers.cheap, ...readers.strong].flatMap((reader) => reader.requests)).toEqual([]);
  });

  it('gives a text that is not a code the usual reply and keeps the photo waiting', async () => {
    await sendWaitingCodePhoto();

    await harness.receiveText('zu-hung', 'cảm ơn', { readers: createFakeReaderSlots() });
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-hung')).toEqual([{ text: UPLOAD_ONLY_TEXT, quoteMessageId: undefined }]);
    expect(await readPhotoStatus('zmsg-1')).toBe('needs_explanation');
    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
  });

  it('does not save the waiting code photo through a re-read when an unclear text is not a code', async () => {
    await sendWaitingCodePhoto();
    const readers = makeReadersThatSeeOnlyTheTextAsUnclear();

    await harness.receiveText('zu-hung', 'Lốp mới thay', { readers });

    expect(await harness.database.query('SELECT 1 FROM records')).toEqual([]);
    expect([...readers.cheap, ...readers.strong].flatMap((reader) => reader.requests).filter((request) => request.image !== null)).toEqual([]);
  });

  it('asks an admin which code is right when his explanation leaves only the code unclear', async () => {
    await sendPhoto('zu-duy', 'zmsg-9', null, makeReadersAnswering(UNCLEAR));
    await harness.sendAllQueuedTexts();
    harness.channel.texts.length = 0;

    await harness.receiveText('zu-duy', TIRE_EXPLANATION, { readers: makeCodeSplitReaders() });
    await harness.sendAllQueuedTexts();

    expect(await readTextsTo('zu-duy')).toEqual([
      { text: CODE_CHOICE_TEXT, quoteMessageId: 'zmsg-9' },
      { text: FIRST_CODE, quoteMessageId: undefined },
      { text: SECOND_CODE, quoteMessageId: undefined },
    ]);
    expect(harness.chat.requests).toEqual([]);
  });

  async function sendWaitingCodePhoto(): Promise<void> {
    await sendPhoto('zu-hung', 'zmsg-1', TIRE_EXPLANATION, makeCodeSplitReaders());
    await harness.sendAllQueuedTexts();
    harness.channel.texts.length = 0;
  }

  async function readRecordedIdentifiers(): Promise<{ event: string; identifiers: string[] }[]> {
    return harness.database.query<{ event: string; identifiers: string[] }>(
      `SELECT event.external_event_id AS event, records.identifiers FROM records
       JOIN messages message ON message.id = records.message_id
       JOIN inbound_events event ON event.id = message.inbound_event_id`,
    );
  }

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

function makeReadersAnswering(reading: unknown): FakeReaderSlots {
  const slots = createFakeReaderSlots();
  for (const reader of [...slots.cheap, ...slots.strong]) reader.answerWith(reading);
  return slots;
}

function makeCodeSplitReaders(): FakeReaderSlots {
  return {
    cheap: [makeReaderOfCode('cheap-1', FIRST_CODE), makeReaderOfCode('cheap-2', SECOND_CODE)],
    strong: [makeReaderOfCode('strong-1', FIRST_CODE), makeReaderOfCode('strong-2', SECOND_CODE)],
  };
}

function makeReadersThatSeeOnlyTheTextAsUnclear(): FakeReaderSlots {
  const makeReader = (label: string, amount: number) =>
    new FakeReader(label, (request): ReaderResult => ({
      ok: true,
      json: request.image === null ? makeReading([makeItem({ amount_vnd: amount })]) : makeTireWithCode(FIRST_CODE),
    }));
  return {
    cheap: [makeReader('cheap-1', 100000), makeReader('cheap-2', 200000)],
    strong: [makeReader('strong-1', 100000), makeReader('strong-2', 200000)],
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
