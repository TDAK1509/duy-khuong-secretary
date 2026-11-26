import type { MessagingChannel } from '../../../src/services/messaging/messaging-channel.ts';

const STUB_MAX_TEXT_LENGTH = 2000;

function refuseToUse(method: string): () => never {
  return () => {
    throw new Error(`the leak test channel stub does not implement ${method}`);
  };
}

export const STUB_CHANNEL: MessagingChannel = {
  channel: 'leak-test-channel',
  maxTextLength: STUB_MAX_TEXT_LENGTH,
  verifyWebhook: refuseToUse('verifyWebhook'),
  parseEvent: refuseToUse('parseEvent'),
  sendText: refuseToUse('sendText'),
  sendImage: refuseToUse('sendImage'),
  sendTemplate: refuseToUse('sendTemplate'),
  getDisplayName: refuseToUse('getDisplayName'),
  reactWithThumbsUp: refuseToUse('reactWithThumbsUp'),
  downloadAttachment: refuseToUse('downloadAttachment'),
};
