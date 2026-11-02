import { afterEach, describe, expect, it } from 'vitest';
import { ZaloOaChannel } from '../../src/providers/messaging/zalo-oa-channel.ts';
import type { DownloadResult } from '../../src/services/messaging/messaging-channel.ts';
import { TEST_CHANNEL_SETTINGS } from '../fixtures/zalo/zalo-fixtures.ts';
import { serveBytes, startStubMediaServer, type MediaHandler, type StubMediaServer } from './stub-media-server.ts';

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

  async function startStubServer(handler: MediaHandler): Promise<StubMediaServer> {
    const server = await startStubMediaServer(handler);
    servers.push(server);
    return server;
  }

  function downloadFromAllowedHost(server: StubMediaServer, path: string, maxBytes: number): Promise<DownloadResult> {
    const channel = new ZaloOaChannel({
      ...TEST_CHANNEL_SETTINGS,
      lookupAddresses: async () => ['127.0.0.1'],
      isPublicAddress: () => true,
      trustedCertificates: server.certificate,
    });
    return channel.downloadAttachment(`https://photo.zdn.vn:${server.port}${path}`, maxBytes);
  }
});
