import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { ChannelRecipient, SendResult } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { makeJpeg } from './intake-harness.ts';
import { replyWithJson, startStubHttpServer, type StubAnswer, type StubHttpServer, type StubRequest } from './stub-http-server.ts';

const DUY: ChannelRecipient = { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-duy' };
const UPLOAD_PATH = '/v2.0/oa/upload/image';
const SEND_PATH = '/v3.0/oa/message/cs';

describe('ZaloOaChannel.sendImage against a stub Zalo API', () => {
  const servers: StubHttpServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('uploads the image, then sends the returned attachment', async () => {
    const jpeg = makeJpeg(300 * 1024);
    const server = await startStubServer({ upload: replyWithJson({ error: 0, data: { attachment_id: 'att-1' } }), send: replyWithJson({ error: 0 }) });

    const result = await sendFromChannel(server.baseUrl, jpeg, 'a1');

    const [upload, send] = server.requests;
    expect(server.requests.map((request) => request.path)).toEqual([UPLOAD_PATH, SEND_PATH]);
    expect(upload?.headers['access_token']).toBe('a1');
    expect(upload?.rawBody.includes(Buffer.from(jpeg))).toBe(true);
    expect(send?.headers['access_token']).toBe('a1');
    expect(JSON.parse(send?.body ?? '')).toEqual({
      recipient: { user_id: 'zu-duy' },
      message: { attachment: { type: 'template', payload: { template_type: 'media', elements: [{ media_type: 'image', attachment_id: 'att-1' }] } } },
    });
    expect(result).toEqual({ ok: true });
  });

  async function startStubServer(answers: { upload: StubAnswer; send: StubAnswer }): Promise<StubHttpServer> {
    const server = await startStubHttpServer((request: StubRequest) => (request.path === UPLOAD_PATH ? answers.upload : answers.send));
    servers.push(server);
    return server;
  }

  function sendFromChannel(apiBaseUrl: string, bytes: Uint8Array, credential: string): Promise<SendResult> {
    const channel = new ZaloOaChannel({ ...TEST_CHANNEL_SETTINGS, apiBaseUrl, timeoutMs: 5000 });
    return channel.sendImage(DUY, { bytes, contentType: 'image/jpeg' }, credential);
  }
});
