import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeReader } from '../fakes/fake-reader.ts';
import type { ReaderSlots } from '../../src/app/reading/decide-reading.ts';
import { makeItem, makeReading } from '../unit/reading/make-reading.ts';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { makeJpeg, createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';

const SAVED_REPLY = 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.';
const PHOTO_KEY = 'w/photo.jpg';
const FIRST_PHOTO_URL = 'https://z.test/1.jpg';
const SECOND_PHOTO_URL = 'https://z.test/2.jpg';
const FIRST_PHOTO_SIZE = 1000;
const SECOND_PHOTO_SIZE = 2000;
const FIRST_REPLY = 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.';
const SECOND_REPLY = 'Đã lưu: Đổ xăng dầu, số 0005678, 850.000đ, ngày 30/10/2026.';

describe('replies that come back as their photo', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await harness.photoStorage.put(PHOTO_KEY, { bytes: makeJpeg(1000), contentType: 'image/jpeg' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('queues a refused photo again as plain text', async () => {
    const id = await insertOutboundMessage(harness.database, { externalUserId: 'zu-hung', photoKey: PHOTO_KEY, body: SAVED_REPLY });
    harness.channel.nextImageResult = { ok: false, reason: 'rejected' };

    await harness.sendQueuedTexts();

    expect(await harness.database.query(`SELECT status, kind, photo_key, body, last_error FROM outbound_messages WHERE id = '${id}'`)).toEqual([
      { status: 'queued', kind: 'text', photo_key: null, body: SAVED_REPLY, last_error: 'image_rejected' },
    ]);
  });

  it('still fails a refused photo that has no text', async () => {
    const id = await insertOutboundMessage(harness.database, { externalUserId: 'zu-hung', photoKey: PHOTO_KEY });
    harness.channel.nextImageResult = { ok: false, reason: 'rejected' };

    await harness.sendQueuedTexts();

    expect(await harness.database.query(`SELECT status, kind, last_error FROM outbound_messages WHERE id = '${id}'`)).toEqual([
      { status: 'failed', kind: 'image', last_error: 'rejected' },
    ]);
  });

  it('sends each photo of a two-photo event back with its own reply', async () => {
    harness.channel.attachments.set(FIRST_PHOTO_URL, { ok: true, bytes: makeJpeg(FIRST_PHOTO_SIZE) });
    harness.channel.attachments.set(SECOND_PHOTO_URL, { ok: true, bytes: makeJpeg(SECOND_PHOTO_SIZE) });
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', kind: 'images', imageUrls: [FIRST_PHOTO_URL, SECOND_PHOTO_URL] });

    await harness.runInbound({ readers: readFuelItemByPhotoSize() });
    await harness.sendAllQueuedTexts();

    expect(harness.channel.sends).toEqual([
      { kind: 'image', to: 'zu-hung', photo: { bytes: makeJpeg(FIRST_PHOTO_SIZE), contentType: 'image/jpeg' }, text: FIRST_REPLY },
      { kind: 'image', to: 'zu-hung', photo: { bytes: makeJpeg(SECOND_PHOTO_SIZE), contentType: 'image/jpeg' }, text: SECOND_REPLY },
    ]);
  });
});

function readFuelItemByPhotoSize(): ReaderSlots {
  const makeReader = (label: string) =>
    new FakeReader(label, ({ image }) => ({ ok: true, json: makeReading([makeFuelItemFor(image?.bytes.length)]) }));
  return { cheap: [makeReader('cheap-1'), makeReader('cheap-2')], strong: [makeReader('strong-1'), makeReader('strong-2')] };
}

function makeFuelItemFor(photoSize: number | undefined) {
  return photoSize === SECOND_PHOTO_SIZE
    ? makeItem({ category: 'fuel', amount_vnd: 850000, occurred_on: '2026-10-30', document_number: '0005678' })
    : makeItem({ category: 'fuel', amount_vnd: 1250000, occurred_on: '2026-10-30', document_number: '0001234' });
}
