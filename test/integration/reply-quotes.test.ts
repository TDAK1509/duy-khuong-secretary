import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeJpeg, createIntakeHarness, type IntakeHarness } from './intake-harness.ts';
import { insertOutboundMessage } from './outbound-message-rows.ts';

const SAVED_REPLY = 'Đã lưu: Đổ xăng dầu, số 0001234, 1.250.000đ, ngày 30/10/2026.';
const PHOTO_KEY = 'w/photo.jpg';

describe('replies that quote the photo they answer', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await harness.photoStorage.put(PHOTO_KEY, { bytes: makeJpeg(1000), contentType: 'image/jpeg' });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('queues a refused quote with a fallback photo again as the photo with the text', async () => {
    const id = await insertOutboundMessage(harness.database, {
      externalUserId: 'zu-hung',
      body: SAVED_REPLY,
      quoteMessageId: 'msg-1',
      fallbackPhotoKey: PHOTO_KEY,
    });
    harness.channel.nextTextResult = { ok: false, reason: 'rejected' };

    await harness.sendQueuedTexts();

    expect(
      await harness.database.query(
        `SELECT status, kind, photo_key, body, quote_message_id, fallback_photo_key, last_error FROM outbound_messages WHERE id = '${id}'`,
      ),
    ).toEqual([
      {
        status: 'queued',
        kind: 'image',
        photo_key: PHOTO_KEY,
        body: SAVED_REPLY,
        quote_message_id: null,
        fallback_photo_key: null,
        last_error: 'quote_rejected',
      },
    ]);
  });

  it('queues a refused quote without a fallback photo again as the plain text', async () => {
    const id = await insertOutboundMessage(harness.database, { externalUserId: 'zu-hung', body: SAVED_REPLY, quoteMessageId: 'msg-1' });
    harness.channel.queuedTextResults.push({ ok: false, reason: 'rejected' }, { ok: true });

    await harness.sendQueuedTexts();
    await harness.sendQueuedTexts();

    expect(await harness.database.query(`SELECT status FROM outbound_messages WHERE id = '${id}'`)).toEqual([{ status: 'sent' }]);
    expect(harness.channel.texts.map((text) => text.quoteMessageId)).toEqual(['msg-1', undefined]);
  });

  it('keeps a quoted text that got no answer as it is', async () => {
    const id = await insertOutboundMessage(harness.database, {
      externalUserId: 'zu-hung',
      body: SAVED_REPLY,
      quoteMessageId: 'msg-1',
      fallbackPhotoKey: PHOTO_KEY,
    });
    harness.channel.nextTextResult = { ok: false, reason: 'no_answer' };

    await harness.sendQueuedTexts();

    expect(await harness.database.query(`SELECT status, kind FROM outbound_messages WHERE id = '${id}'`)).toEqual([
      { status: 'unknown', kind: 'text' },
    ]);
  });
});
