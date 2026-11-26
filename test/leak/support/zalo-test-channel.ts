import { ZaloOaChannel } from '../../../src/providers/messaging/zalo-oa-channel.ts';

const MADE_UP_SETTINGS = {
  appId: 'made-up-app',
  oaSecret: 'made-up-secret',
  businessApiBaseUrl: 'http://127.0.0.1:1',
  timeoutMs: 5_000,
  mediaHosts: [],
};

export function buildZaloTestChannel(apiBaseUrl = 'http://127.0.0.1:1'): ZaloOaChannel {
  return new ZaloOaChannel({ ...MADE_UP_SETTINGS, apiBaseUrl });
}

export function buildTextWebhookBody(fields: { message?: Record<string, unknown>; topLevel?: Record<string, unknown> }): string {
  return JSON.stringify({
    event_name: 'user_send_text',
    timestamp: '1767225600000',
    sender: { id: 'made-up-sender' },
    recipient: { id: 'made-up-oa' },
    message: { msg_id: 'MADE-UP-MSG-1', text: 'cập nhật phiếu này', ...fields.message },
    ...fields.topLevel,
  });
}
