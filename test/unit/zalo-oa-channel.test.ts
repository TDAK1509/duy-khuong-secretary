import { describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import { loadSignedFixture, signBody, TEST_APP_ID, TEST_OA_SECRET } from '../fixtures/zalo/zalo-fixtures.ts';

describe('ZaloOaChannel.verifyWebhook', () => {
  const channel = new ZaloOaChannel({ appId: TEST_APP_ID, oaSecret: TEST_OA_SECRET });

  it('accepts a correctly signed event', () => {
    const { body, headers } = loadSignedFixture('text-event');

    expect(channel.verifyWebhook(body, headers)).toBe(true);
  });

  it('refuses a signature made with another secret', () => {
    const { body } = loadSignedFixture('text-event');
    const { headers } = signBody(body, 'another-secret');

    expect(channel.verifyWebhook(body, headers)).toBe(false);
  });
});
