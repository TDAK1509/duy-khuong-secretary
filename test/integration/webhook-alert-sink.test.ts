import { afterEach, describe, expect, it } from 'vitest';
import { WebhookAlertSink } from '../../src/providers/alerts/webhook-alert-sink.ts';
import { replyWithJson, startStubHttpServer, streamEndlessBody, type StubHttpServer } from './stub-http-server.ts';

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

  it('drops the connection of an accepted alert whose webhook keeps streaming a body', async () => {
    server = await startStubHttpServer(streamEndlessBody(200));

    await new WebhookAlertSink(`${server.baseUrl}/hook`).notify('test alert');

    await server.responseClosed;
  });

  it('drops the connection and reports the status when the webhook refuses the alert', async () => {
    server = await startStubHttpServer(streamEndlessBody(502));

    const failure = await new WebhookAlertSink(`${server.baseUrl}/hook`).notify('test alert').catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 502 });
    await server.responseClosed;
  });
});
