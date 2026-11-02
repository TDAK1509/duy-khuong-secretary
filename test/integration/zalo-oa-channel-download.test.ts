import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { DownloadResult } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { answerWithStatus, redirectTo, serveBytes, startStubMediaServer, type MediaHandler, type StubMediaServer } from './stub-media-server.ts';

const FIVE_MEGABYTES = 5_000_000;

describe('ZaloOaChannel.downloadAttachment against a stub media server', () => {
  const servers: StubMediaServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('returns the bytes of an attachment', async () => {
    const photo = new Uint8Array(200_000).fill(7);
    const server = await startStubServer(serveBytes(photo));

    const result = await downloadFromAllowedHost(server, '/a.jpg', FIVE_MEGABYTES);

    expect(result).toEqual({ ok: true, bytes: photo });
  });

  it('stops a download that passes the limit', async () => {
    const server = await startStubServer(serveBytes(new Uint8Array(6_000_000)));

    const result = await downloadFromAllowedHost(server, '/a.jpg', FIVE_MEGABYTES);

    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('reports a missing attachment as unavailable', async () => {
    const server = await startStubServer(answerWithStatus(404));

    const result = await downloadFromAllowedHost(server, '/a.jpg', FIVE_MEGABYTES);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not fetch a plain http URL', async () => {
    const lookedUp: string[] = [];
    const channel = new ZaloOaChannel({
      ...TEST_CHANNEL_SETTINGS,
      lookupAddresses: async (hostname) => {
        lookedUp.push(hostname);
        return ['127.0.0.1'];
      },
    });

    const result = await channel.downloadAttachment('http://photo.zdn.vn/a.jpg', FIVE_MEGABYTES);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(lookedUp).toEqual([]);
  });

  it('does not fetch a host outside the allow-list', async () => {
    const lookedUp: string[] = [];
    const channel = new ZaloOaChannel({
      ...TEST_CHANNEL_SETTINGS,
      lookupAddresses: async (hostname) => {
        lookedUp.push(hostname);
        return ['127.0.0.1'];
      },
    });

    const result = await channel.downloadAttachment('https://evil.example/a.jpg', FIVE_MEGABYTES);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(lookedUp).toEqual([]);
  });

  it('does not follow a redirect to a host outside the allow-list', async () => {
    const server = await startStubServer(redirectTo('https://evil.example/a.jpg'));
    const lookedUp: string[] = [];

    const result = await downloadFromAllowedHost(server, '/a.jpg', FIVE_MEGABYTES, lookedUp);

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(lookedUp).toEqual(['photo.zdn.vn']);
  });

  async function startStubServer(handler: MediaHandler): Promise<StubMediaServer> {
    const server = await startStubMediaServer(handler);
    servers.push(server);
    return server;
  }

  function downloadFromAllowedHost(
    server: StubMediaServer,
    path: string,
    maxBytes: number,
    lookedUp: string[] = [],
  ): Promise<DownloadResult> {
    const channel = new ZaloOaChannel({
      ...TEST_CHANNEL_SETTINGS,
      lookupAddresses: async (hostname) => {
        lookedUp.push(hostname);
        return ['127.0.0.1'];
      },
      isPublicAddress: () => true,
      trustedCertificates: server.certificate,
    });
    return channel.downloadAttachment(`https://photo.zdn.vn:${server.port}${path}`, maxBytes);
  }
});
