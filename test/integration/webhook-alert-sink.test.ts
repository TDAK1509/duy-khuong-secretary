import { afterEach, describe, expect, it } from 'vitest';
import { WebhookAlertSink } from '../../src/providers/alerts/webhook-alert-sink.ts';
import { replyWithJson, startStubHttpServer, type StubHttpServer } from './stub-http-server.ts';

describe('WebhookAlertSink', () => {
  let server: StubHttpServer;

  afterEach(async () => {
    await server.close();
  });

  it('posts the text as JSON', async () => {
    server = await startStubHttpServer(replyWithJson({ ok: true }));

    await new WebhookAlertSink(`${server.baseUrl}/hook`).notify('test alert');

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({ method: 'POST', path: '/hook', body: '{"text":"test alert"}' });
    expect(server.requests[0]?.headers['content-type']).toBe('application/json');
  });
});
