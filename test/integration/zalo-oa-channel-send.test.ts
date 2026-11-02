import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { ChannelRecipient, SendResult } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { replyWithJson, startStubHttpServer, type StubAnswer, type StubHttpServer } from './stub-http-server.ts';

const HUNG: ChannelRecipient = { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' };

describe('ZaloOaChannel.sendText against a stub Zalo API', () => {
  const servers: StubHttpServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('posts the recipient, the text and the access key', async () => {
    const server = await startStubServer(replyWithJson({ error: 0 }));

    await sendFromChannel(server.baseUrl, 'chào', 'a1');

    const [request] = server.requests;
    expect(server.requests).toHaveLength(1);
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/v3.0/oa/message/cs');
    expect(request?.headers['access_token']).toBe('a1');
    expect(request?.body).toBe('{"recipient":{"user_id":"zu-hung"},"message":{"text":"chào"}}');
  });

  it('turns a success answer into ok', async () => {
    const server = await startStubServer(replyWithJson({ error: 0 }));

    const result = await sendFromChannel(server.baseUrl, 'chào', 'a1');

    expect(result).toEqual({ ok: true });
  });

  async function startStubServer(answer: StubAnswer): Promise<StubHttpServer> {
    const server = await startStubHttpServer(answer);
    servers.push(server);
    return server;
  }

  function sendFromChannel(apiBaseUrl: string, text: string, credential: string, timeoutMs = 5000): Promise<SendResult> {
    const channel = new ZaloOaChannel({ ...TEST_CHANNEL_SETTINGS, apiBaseUrl, timeoutMs });
    return channel.sendText(HUNG, text, credential);
  }
});
