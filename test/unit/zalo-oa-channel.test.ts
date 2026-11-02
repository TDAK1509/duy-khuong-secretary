import { describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import { loadSignedFixture, signBody, TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';

describe('ZaloOaChannel.verifyWebhook', () => {
  const channel = new ZaloOaChannel(TEST_CHANNEL_SETTINGS);

  it('accepts a correctly signed event', () => {
    const { body, headers } = loadSignedFixture('text-event');

    expect(channel.verifyWebhook(body, headers)).toBe(true);
  });

  it('refuses a signature made with another secret', () => {
    const { body } = loadSignedFixture('text-event');
    const { headers } = signBody(body, 'another-secret');

    expect(channel.verifyWebhook(body, headers)).toBe(false);
  });

  it('refuses an event without a signature header', () => {
    const { body } = loadSignedFixture('text-event');

    expect(channel.verifyWebhook(body, {})).toBe(false);
  });

  it('refuses an event whose body changed after signing', () => {
    const { body, headers } = loadSignedFixture('text-event');

    expect(channel.verifyWebhook(body.replace('chào', 'chao'), headers)).toBe(false);
  });
});

describe('ZaloOaChannel.verifyWebhook on a body that is not a Zalo event', () => {
  const channel = new ZaloOaChannel(TEST_CHANNEL_SETTINGS);
  const headers = { 'x-zevent-signature': 'mac=00' };

  it.each([
    ['not JSON', 'not json'],
    ['a body without a timestamp', '{"app_id":"app-test","event_name":"user_send_text"}'],
    ['a body without an app id', '{"timestamp":"1","event_name":"user_send_text"}'],
  ])('refuses %s', (_name, body) => {
    expect(channel.verifyWebhook(body, headers)).toBe(false);
  });
});

describe('ZaloOaChannel.parseEvent', () => {
  const channel = new ZaloOaChannel(TEST_CHANNEL_SETTINGS);

  it('parses a text event', () => {
    const { body } = loadSignedFixture('text-event');

    expect(channel.parseEvent(body)).toEqual({
      kind: 'text',
      eventId: 'm1',
      from: { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' },
      text: 'chào',
      sentAt: new Date('2026-11-02T10:00:00+07:00'),
    });
  });

  it('parses an image event with its URL and caption', () => {
    const { body } = loadSignedFixture('image-event');

    expect(channel.parseEvent(body)).toMatchObject({
      kind: 'images',
      imageUrls: ['https://f6.photo.talk.zdn.vn/p1.jpg'],
      caption: 'Xe 29C-123.45',
    });
  });

  it('keeps both photo URLs of a two-photo image event in order', () => {
    const { body } = loadSignedFixture('two-images-event');

    expect(channel.parseEvent(body)).toMatchObject({
      kind: 'images',
      imageUrls: ['https://f6.photo.talk.zdn.vn/p1.jpg', 'https://f6.photo.talk.zdn.vn/p2.jpg'],
      caption: null,
    });
  });

  it('ignores a follow event', () => {
    const { body } = loadSignedFixture('follow-event');

    expect(channel.parseEvent(body)).toEqual({ kind: 'ignored' });
  });

  it('ignores an image event without an image attachment', () => {
    const { body } = loadSignedFixture('image-event');
    const withoutImage = body.replace('"type":"image"', '"type":"file"');

    expect(channel.parseEvent(withoutImage)).toEqual({ kind: 'ignored' });
  });

  it('ignores an event whose timestamp is outside the range of a date', () => {
    const { body } = loadSignedFixture('text-event');

    expect(channel.parseEvent(body.replace('1793588400000', '99999999999999999'))).toEqual({ kind: 'ignored' });
  });

  it('ignores a body that is not a Zalo event', () => {
    expect(channel.parseEvent('not json')).toEqual({ kind: 'ignored' });
  });
});
