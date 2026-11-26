import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startFakeZaloApi } from './support/fake-zalo-api.ts';
import { buildZaloTestChannel } from './support/zalo-test-channel.ts';

const RECIPIENT = { channel: 'zalo-oa', accountId: 'made-up-oa', externalUserId: 'made-up-user' };
const PHOTO = { bytes: Uint8Array.of(0xff, 0xd8, 0xff, 0xe0), contentType: 'image/jpeg' as const };

test('a successful Zalo image send returns the message id from the answer', async () => {
  const zalo = await startFakeZaloApi({
    upload: { error: 0, data: { attachment_id: 'ATTACHMENT-1' } },
    send: { error: 0, data: { message_id: 'SENT-1' } },
  });
  try {
    const result = await buildZaloTestChannel(zalo.baseUrl).sendImage(RECIPIENT, PHOTO, 'made-up-token');
    assert.deepEqual(result, { ok: true, messageId: 'SENT-1' });
  } finally {
    await zalo.close();
  }
});
