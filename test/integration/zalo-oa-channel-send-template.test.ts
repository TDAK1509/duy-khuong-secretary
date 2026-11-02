import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { ChannelRecipient, SendResult } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { replyWithJson, startStubHttpServer, type StubAnswer, type StubHttpServer } from './stub-http-server.ts';

const DUY: ChannelRecipient = { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-duy' };

describe('ZaloOaChannel.sendTemplate against a stub Zalo API', () => {
  const servers: StubHttpServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('posts the template id, the params, the user id and the access key', async () => {
    const server = await startStubServer(replyWithJson({ error: 0 }));

    const result = await sendFromChannel(server.baseUrl);

    const [request] = server.requests;
    expect(server.requests).toHaveLength(1);
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/v3.0/oa/message/template');
    expect(request?.headers['access_token']).toBe('a1');
    expect(request?.body).toBe('{"user_id":"zu-duy","template_id":"tpl-1","template_data":{"task_title":"Báo cáo"}}');
    expect(result).toEqual({ ok: true });
  });

  async function startStubServer(answer: StubAnswer): Promise<StubHttpServer> {
    const server = await startStubHttpServer(answer);
    servers.push(server);
    return server;
  }

  function sendFromChannel(businessApiBaseUrl: string): Promise<SendResult> {
    const channel = new ZaloOaChannel({ ...TEST_CHANNEL_SETTINGS, businessApiBaseUrl, timeoutMs: 5000 });
    return channel.sendTemplate(DUY, { templateId: 'tpl-1', params: { task_title: 'Báo cáo' } }, 'a1');
  }
});
