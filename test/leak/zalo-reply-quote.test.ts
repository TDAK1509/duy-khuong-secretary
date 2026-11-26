import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTextWebhookBody, buildZaloTestChannel } from './support/zalo-test-channel.ts';

test('a Zalo reply text keeps the quoted message id', () => {
  const event = buildZaloTestChannel().parseEvent(buildTextWebhookBody({ message: { quote_msg_id: 'QUOTED-1' } }));
  assert.equal(event.kind, 'text');
  assert.equal(event.kind === 'text' && event.quoteMessageId, 'QUOTED-1');
});

test('a quote id at the top level of the Zalo event is also kept', () => {
  const event = buildZaloTestChannel().parseEvent(buildTextWebhookBody({ topLevel: { quote_msg_id: 'QUOTED-2' } }));
  assert.equal(event.kind, 'text');
  assert.equal(event.kind === 'text' && event.quoteMessageId, 'QUOTED-2');
});
