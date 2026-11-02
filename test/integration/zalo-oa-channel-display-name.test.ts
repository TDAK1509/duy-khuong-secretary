import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { ChannelRecipient } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { replyWithJson, startStubHttpServer, type StubAnswer, type StubHttpServer } from './stub-http-server.ts';

const HUNG: ChannelRecipient = { channel: 'zalo-oa', accountId: 'oa-1', externalUserId: 'zu-hung' };

describe('ZaloOaChannel.getDisplayName against a stub Zalo API', () => {
  const servers: StubHttpServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("reads the name from Zalo's user detail", async () => {
    const server = await startStubServer(replyWithJson({ error: 0, data: { display_name: 'Hung Nguyen' } }));

    const name = await readNameFromChannel(server.baseUrl);

    const [request] = server.requests;
    expect(name).toBe('Hung Nguyen');
    expect(request?.method).toBe('GET');
    expect(request?.headers['access_token']).toBe('a1');
    expect(new URL(request?.path ?? '', server.baseUrl).pathname).toBe('/v3.0/oa/user/detail');
    expect(new URL(request?.path ?? '', server.baseUrl).searchParams.get('data')).toBe('{"user_id":"zu-hung"}');
  });

  async function startStubServer(answer: StubAnswer): Promise<StubHttpServer> {
    const server = await startStubHttpServer(answer);
    servers.push(server);
    return server;
  }

  function readNameFromChannel(apiBaseUrl: string): Promise<string | null> {
    const channel = new ZaloOaChannel({ ...TEST_CHANNEL_SETTINGS, apiBaseUrl });
    return channel.getDisplayName(HUNG, 'a1');
  }
});
