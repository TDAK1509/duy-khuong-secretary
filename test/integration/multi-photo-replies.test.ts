import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeJpeg, createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';

const SAVED_REPLY = 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.';
const PHOTO_KEY = 'w/photo.jpg';

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
});
