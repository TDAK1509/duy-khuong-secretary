import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertInboundEvent } from './inbound-event-rows.ts';
import { createIntakeHarness, makeJpeg, PHOTO_URL, type IntakeHarness } from './intake-harness.ts';
import { setCreditBalance } from './llm-call-rows.ts';

const OUT_OF_CREDIT_TEXT =
  'Nhóm của bạn đã hết credit nên Trợ lý chưa đọc tin nhắn này. Quản lý nhóm cần liên hệ bên cung cấp Trợ lý để nạp thêm credit. Sau khi nạp, bạn gửi lại tin nhắn này nhé.';

describe('a workspace with no credits', () => {
  let harness: IntakeHarness;

  beforeEach(async () => {
    harness = await createIntakeHarness();
    await setCreditBalance(harness.database, harness.workspaceId, 0);
  });

  afterEach(async () => {
    await harness.close();
  });

  it('stores the photo of a member without reading it and tells the member', async () => {
    harness.channel.attachments.set(PHOTO_URL, { ok: true, bytes: makeJpeg(1000) });
    await insertInboundEvent(harness.database, { externalUserId: 'zu-hung', externalEventId: 'zmsg-photo', kind: 'images', imageUrls: [PHOTO_URL] });

    await harness.runInbound();
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toEqual([]);
    expect(await harness.database.query("SELECT author, submission_status FROM messages WHERE image_key IS NOT NULL")).toEqual([
      { author: 'user', submission_status: 'pending' },
    ]);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT, quoteMessageId: 'zmsg-photo' }]);
  });

  it('stores the text of a member without reading it and tells the member', async () => {
    await harness.receiveText('zu-hung', 'Đổ dầu 500.000đ');
    await harness.sendAllQueuedTexts();

    expect(harness.reader.requests).toEqual([]);
    expect(await harness.database.query('SELECT author, text, submission_status FROM messages')).toEqual([
      { author: 'user', text: 'Đổ dầu 500.000đ', submission_status: 'pending' },
    ]);
    expect(harness.channel.texts).toMatchObject([{ text: OUT_OF_CREDIT_TEXT }]);
  });
});
